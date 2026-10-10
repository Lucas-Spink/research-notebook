import type {
  ArtefactsFileModel,
  NotebookError,
} from "@research-notebook/format";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { refusalMessage, resultsMessages } from "./messages";
import type { GroupAction } from "./model/actions";
import { draggedFrom, dropAction, type Dragged } from "./model/drag";
import { navigate, rowCommand } from "./model/keys";
import type { PickMode } from "./model/menu";
import {
  ranged,
  selectedRows,
  toggled,
  type Selection,
} from "./model/selection";
import {
  expansionFor,
  treeRows,
  type Expansion,
  type GroupTarget,
  type TreeRow,
} from "./model/tree";

/** What carrying out an action came to. The caller writes `artefacts.yaml`; this tree never does. */
export type ActionOutcome = { ok: true } | { ok: false; error: NotebookError };

/** The panel open under the tree for one row: its actions, a picker, a name form or a delete confirmation. */
export type Panel =
  | { kind: "menu"; row: TreeRow }
  | { kind: "details"; row: Extract<TreeRow, { kind: "item" }> }
  | { kind: "pick"; row: TreeRow; mode: PickMode; targets: GroupTarget[] }
  | { kind: "rename"; row: Extract<TreeRow, { kind: "group" }> }
  | { kind: "renameResult"; row: Extract<TreeRow, { kind: "item" }> }
  | { kind: "newSubgroup"; row: Extract<TreeRow, { kind: "group" }> }
  | { kind: "confirmDelete"; row: Extract<TreeRow, { kind: "group" }> };

type Options = {
  file: ArtefactsFileModel;
  disabled: boolean;
  onAction: (action: GroupAction) => Promise<ActionOutcome>;
  /** Opens an artefact's preview (ADR-0044); leave out where there is none to open. */
  onOpen?: (artefactId: string) => void;
  /** Opens a result's file outside the application; resolves whether it worked. Leave out where there is none. */
  onFileAction?: (
    artefactId: string,
    action: "openFile" | "reveal",
  ) => Promise<boolean>;
};

/** Copy rather than move: Ctrl on Windows, Option on macOS. */
const copyKey = (event: DragEvent) => event.ctrlKey || event.altKey;

/**
 * The state of the Results tree: which rows are open (in memory only, not
 * saved), which row has focus, the open panel and the last refusal.
 */
export function useResultsTree({
  file,
  disabled,
  onAction,
  onOpen,
  onFileAction,
}: Options) {
  const [expansion, setExpansion] = useState<Expansion>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [chosenKeys, setChosenKeys] = useState<Selection>(new Set());
  const anchor = useRef<string | null>(null);
  const dragged = useRef<Dragged | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const moveFocus = useRef(false);

  const rows = useMemo(() => treeRows(file, expansion), [file, expansion]);
  // Rows hidden by collapsing a folder drop out of the selection.
  const chosen = useMemo(
    () => selectedRows(rows, chosenKeys),
    [rows, chosenKeys],
  );
  const tabKey = rows.some((row) => row.key === focus)
    ? focus
    : (rows[0]?.key ?? null);

  useEffect(() => {
    if (!moveFocus.current || tabKey === null) return;
    moveFocus.current = false;
    rowRefs.current.get(tabKey)?.focus();
  }, [tabKey, panel]);

  const focusRow = useCallback((key: string) => {
    moveFocus.current = true;
    setFocus(key);
  }, []);

  const toggle = useCallback((key: string, expanded: boolean) => {
    setExpansion((current) => ({ ...current, [key]: expanded }));
  }, []);

  /** Opens or closes a group and everything in it, or the whole tree for `null`. */
  const setAll = useCallback(
    (groupId: string | null, expanded: boolean) => {
      setExpansion((current) => ({
        ...current,
        ...expansionFor(file, groupId, expanded),
      }));
    },
    [file],
  );

  const run = useCallback(
    async (action: GroupAction) => {
      setStatus(null);
      const outcome = await onAction(action);
      if (!outcome.ok) setStatus(refusalMessage(outcome.error));
      if (outcome.ok) setPanel(null);
      moveFocus.current = true;
      return outcome.ok;
    },
    [onAction],
  );

  /**
   * A click on a row: Ctrl or Command adds or removes an artefact, Shift
   * chooses everything from the last one, and a plain click chooses just
   * that one. Clicking a folder clears the choice.
   */
  const choose = useCallback(
    (row: TreeRow, modifiers: { ctrl: boolean; shift: boolean }) => {
      if (row.kind !== "item") {
        setChosenKeys(new Set());
        return;
      }
      if (modifiers.shift) {
        setChosenKeys((current) =>
          ranged(rows, current, anchor.current, row.key),
        );
        return;
      }
      anchor.current = row.key;
      setChosenKeys((current) =>
        modifiers.ctrl ? toggled(current, row.key) : new Set([row.key]),
      );
    },
    [rows],
  );

  const closePanel = useCallback(() => {
    setPanel(null);
    moveFocus.current = true;
  }, []);

  function onKeyDown(row: TreeRow, event: KeyboardEvent) {
    if (event.key === " " && row.kind === "item") {
      event.preventDefault();
      choose(row, { ctrl: true, shift: false });
      return;
    }
    const next = navigate(rows, row.key, event.key);
    if (next !== null && !event.altKey) {
      event.preventDefault();
      if ("focus" in next && event.shiftKey) {
        // Shift with an arrow key grows the choice, as in a file manager.
        setChosenKeys((current) =>
          ranged(rows, current, anchor.current ?? row.key, next.focus),
        );
        anchor.current ??= row.key;
      }
      if ("focus" in next) focusRow(next.focus);
      else toggle(next.expand, next.expanded);
      return;
    }
    if (disabled) {
      // Read-only: nothing can change, but a file can still be looked at.
      if (row.kind === "item" && event.key === "Enter" && onOpen) {
        event.preventDefault();
        onOpen(row.artefactId);
      }
      return;
    }
    const command = rowCommand(row, event);
    if (command === null) return;
    event.preventDefault();
    setFocus(row.key);
    if (command.kind === "action") void run(command.action);
    else if (command.kind === "menu") setPanel({ kind: "menu", row });
    else if (row.kind === "group") setPanel({ kind: command.kind, row });
  }

  const drag = {
    start(row: TreeRow, event: DragEvent) {
      // Dragging one of several chosen artefacts takes them all.
      dragged.current =
        row.kind === "item" && chosen.length > 1 && chosenKeys.has(row.key)
          ? {
              kind: "items",
              items: chosen.flatMap((item) => {
                const one = draggedFrom(item);
                return one?.kind === "item" ? [one] : [];
              }),
            }
          : draggedFrom(row);
      event.dataTransfer.effectAllowed = "copyMove";
      if (row.kind !== "ungrouped")
        event.dataTransfer.setData("text/plain", row.name);
    },
    over(row: TreeRow, event: DragEvent) {
      const source = dragged.current;
      if (source === null || dropAction(source, row, copyKey(event)) === null)
        return;
      event.preventDefault();
      event.dataTransfer.dropEffect = copyKey(event) ? "copy" : "move";
    },
    drop(row: TreeRow, event: DragEvent) {
      const source = dragged.current;
      dragged.current = null;
      const action =
        source === null ? null : dropAction(source, row, copyKey(event));
      if (action === null) return;
      event.preventDefault();
      void run(action);
    },
    end() {
      dragged.current = null;
    },
  };

  return {
    rows,
    tabKey,
    panel,
    status,
    rowRefs,
    /** Records focus that arrived by mouse or Tab, without moving it again. */
    noteFocus: setFocus,
    toggle,
    chosen,
    choose,
    setAll,
    run,
    setPanel,
    closePanel,
    onKeyDown,
    drag,
    /** Opens an artefact's preview, or `undefined` when the tree has none to open. */
    open: onOpen,
    /** Opens or reveals a result's file; `undefined` when the tree cannot. */
    fileAction:
      onFileAction === undefined
        ? undefined
        : async (artefactId: string, action: "openFile" | "reveal") => {
            setStatus(null);
            if (!(await onFileAction(artefactId, action)))
              setStatus(resultsMessages.fileActionFailed);
          },
  };
}

export type ResultsTreeState = ReturnType<typeof useResultsTree>;
