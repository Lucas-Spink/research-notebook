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
import { refusalMessage } from "./messages";
import type { GroupAction } from "./model/actions";
import { draggedFrom, dropAction, type Dragged } from "./model/drag";
import { navigate, rowCommand } from "./model/keys";
import type { PickMode } from "./model/menu";
import {
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
  | { kind: "pick"; row: TreeRow; mode: PickMode; targets: GroupTarget[] }
  | { kind: "rename"; row: Extract<TreeRow, { kind: "group" }> }
  | { kind: "newSubgroup"; row: Extract<TreeRow, { kind: "group" }> }
  | { kind: "confirmDelete"; row: Extract<TreeRow, { kind: "group" }> };

type Options = {
  file: ArtefactsFileModel;
  disabled: boolean;
  onAction: (action: GroupAction) => Promise<ActionOutcome>;
};

/** Copy rather than move: Ctrl on Windows, Option on macOS. */
const copyKey = (event: DragEvent) => event.ctrlKey || event.altKey;

/**
 * The state of the Results tree: which rows are open (in memory only, not
 * saved), which row has focus, the open panel and the last refusal.
 */
export function useResultsTree({ file, disabled, onAction }: Options) {
  const [expansion, setExpansion] = useState<Expansion>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const dragged = useRef<Dragged | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const moveFocus = useRef(false);

  const rows = useMemo(() => treeRows(file, expansion), [file, expansion]);
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

  const closePanel = useCallback(() => {
    setPanel(null);
    moveFocus.current = true;
  }, []);

  function onKeyDown(row: TreeRow, event: KeyboardEvent) {
    const next = navigate(rows, row.key, event.key);
    if (next !== null && !event.altKey) {
      event.preventDefault();
      if ("focus" in next) focusRow(next.focus);
      else toggle(next.expand, next.expanded);
      return;
    }
    if (disabled) return;
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
      dragged.current = draggedFrom(row);
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
    run,
    setPanel,
    closePanel,
    onKeyDown,
    drag,
  };
}

export type ResultsTreeState = ReturnType<typeof useResultsTree>;
