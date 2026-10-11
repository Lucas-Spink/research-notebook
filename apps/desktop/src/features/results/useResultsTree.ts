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
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent,
} from "react";
import { refusalMessage, resultsMessages } from "./messages";
import type { GroupAction } from "./model/actions";
import {
  draggedFrom,
  dropAction,
  dropOnRoot,
  type Dragged,
} from "./model/drag";
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
  | { kind: "confirmDelete"; row: Extract<TreeRow, { kind: "group" }> }
  | { kind: "removeFile"; row: Extract<TreeRow, { kind: "item" }> };

type Options = {
  file: ArtefactsFileModel;
  disabled: boolean;
  onAction: (action: GroupAction) => Promise<ActionOutcome>;
  /** Opens an artefact's preview (ADR-0044); leave out where there is none to open. */
  onOpen?: (artefactId: string) => void;
  /** Removes a result's file from the notebook, to the bin; resolves whether it was. Left out where files cannot be removed. */
  onRemoveFile?: (artefactId: string) => Promise<boolean>;
  /** What to say before a file is removed, such as how many places refer to it. */
  removeWarning?: (artefactId: string) => string;
  /** Opens a result's file outside the application; resolves whether it worked. Leave out where there is none. */
  onFileAction?: (
    artefactId: string,
    action: "openFile" | "reveal",
  ) => Promise<boolean>;
  /** Leave out the Ungrouped area while it holds nothing, so a small tree stays small. */
  hideEmptyUngrouped?: boolean;
};

/** Copy rather than move: Ctrl on Windows, Option on macOS. */
const copyKey = (event: { ctrlKey: boolean; altKey: boolean }) =>
  event.ctrlKey || event.altKey;

/** The key the tree's background answers to as a drop target. */
export const ROOT_KEY = "root";

/** How far the pointer must travel with the button down before a press becomes a drag. */
const DRAG_THRESHOLD = 5;

/** A drag in progress: what is carried, where the pointer is, and what it is over. */
export type DragState = {
  label: string;
  x: number;
  y: number;
  /** The key of the row the pointer is over, `"root"` for the tree's background, or `null`. */
  over: string | null;
  /** Whether dropping there would do anything. */
  valid: boolean;
  /** The copy key is held, so the drop adds rather than moves. */
  copy: boolean;
};

/**
 * The state of the Results tree: which rows are open (in memory only, not
 * saved), which row has focus, the open panel and the last refusal.
 */
export function useResultsTree({
  file,
  disabled,
  onAction,
  onOpen,
  onRemoveFile,
  removeWarning,
  onFileAction,
  hideEmptyUngrouped = false,
}: Options) {
  const [expansion, setExpansion] = useState<Expansion>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [chosenKeys, setChosenKeys] = useState<Selection>(new Set());
  const anchor = useRef<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  // A drag ends with a click on the row it started on, which must not also choose or open it.
  const dragEnded = useRef(false);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const moveFocus = useRef(false);

  const rows = useMemo(() => {
    const all = treeRows(file, expansion);
    return hideEmptyUngrouped
      ? all.filter((row) => !(row.kind === "ungrouped" && row.itemCount === 0))
      : all;
  }, [file, expansion, hideEmptyUngrouped]);
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

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => () => stopDrag.current?.(), []);

  /**
   * Drag and drop by pointer, not by the browser's drag events. The desktop
   * window takes over drag and drop to receive files dropped from outside
   * (ADR-0044 point 2), and on Windows that switches the page's own drag
   * events off, so a drag between rows would never start.
   */
  const drag = {
    start(row: TreeRow, event: ReactPointerEvent) {
      if (disabled || row.kind === "ungrouped" || event.button !== 0) return;
      if (
        event.target instanceof Element &&
        event.target.closest("button, input, select, a") !== null
      )
        return;
      // Dragging one of several chosen artefacts takes them all.
      const source: Dragged | null =
        row.kind === "item" && chosen.length > 1 && chosenKeys.has(row.key)
          ? {
              kind: "items",
              items: chosen.flatMap((item) => {
                const one = draggedFrom(item);
                return one?.kind === "item" ? [one] : [];
              }),
            }
          : draggedFrom(row);
      if (source === null) return;
      stopDrag.current?.();
      const label =
        source.kind === "items" ? `${source.items.length} items` : row.name;
      const origin = { x: event.clientX, y: event.clientY };
      let started = false;

      // The row under the pointer, or the tree's background, which is the top level.
      const keyAt = (x: number, y: number): string | null =>
        document
          .elementFromPoint(x, y)
          ?.closest("[data-row-key]")
          ?.getAttribute("data-row-key") ?? null;
      const actionAt = (e: PointerEvent) => {
        const key = keyAt(e.clientX, e.clientY);
        if (key === ROOT_KEY) return { key, action: dropOnRoot(source) };
        const target = rowsRef.current.find((r) => r.key === key) ?? null;
        return {
          key: target?.key ?? null,
          action:
            target === null ? null : dropAction(source, target, copyKey(e)),
        };
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", onKey, true);
        document.body.classList.remove("results-dragging");
        stopDrag.current = null;
      };
      const finish = () => {
        cleanup();
        setDragState(null);
        if (started) {
          dragEnded.current = true;
          setTimeout(() => {
            dragEnded.current = false;
          }, 0);
        }
      };
      function move(e: PointerEvent) {
        if (!started) {
          if (
            Math.hypot(e.clientX - origin.x, e.clientY - origin.y) <
            DRAG_THRESHOLD
          )
            return;
          started = true;
          document.body.classList.add("results-dragging");
        }
        const { key, action } = actionAt(e);
        setDragState({
          label,
          x: e.clientX,
          y: e.clientY,
          over: key,
          valid: action !== null,
          copy: copyKey(e),
        });
      }
      function up(e: PointerEvent) {
        const wasDragging = started;
        const { action } = actionAt(e);
        finish();
        if (wasDragging && action !== null) void run(action);
      }
      function cancel() {
        finish();
      }
      function onKey(e: globalThis.KeyboardEvent) {
        if (e.key === "Escape") {
          e.stopPropagation();
          finish();
        }
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", onKey, true);
      stopDrag.current = cleanup;
    },
    /** Whether a click that just arrived is the end of a drag, and so is not a click. */
    justEnded: () => dragEnded.current,
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
    /** The drag in progress, for the row it is over and the label that follows the pointer. */
    dragState,
    /** Opens an artefact's preview, or `undefined` when the tree has none to open. */
    open: onOpen,
    /** Removes a file to the bin, or `undefined` when the tree cannot. */
    removeFile:
      onRemoveFile === undefined
        ? undefined
        : async (artefactId: string) => {
            setStatus(null);
            const removed = await onRemoveFile(artefactId);
            if (removed) setPanel(null);
            else setStatus(resultsMessages.removeFileFailed);
          },
    removeWarning,
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
