import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  isGridKey,
  moveCell,
  settleCell,
  type GridCell,
} from "./model/gridFocus";
import type { TableRow } from "./model/rows";

type Options = {
  rows: readonly TableRow[];
  /** Shown columns, counting the Experiment column. */
  colCount: number;
  grid: RefObject<HTMLElement | null>;
  /** Brings a row into view, so the cell moved to is rendered and can take focus. */
  scrollToIndex: (index: number) => void;
  /** Closes the live editor once its text is saved. Resolves whether it closed. */
  closeEditor: () => Promise<boolean>;
};

export type GridFocus = {
  /** The cell holding the grid's one tab stop, or `null` when no experiment is shown. */
  cell: GridCell | null;
  /** That cell's row, so it can be kept rendered while scrolled away. */
  rowIndex: number | null;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
};

/** The grid cell an element sits in, from the cell's data attributes. */
function cellOf(target: Element): GridCell | null {
  const cell = target.closest("[data-grid-row][data-grid-col]");
  if (!(cell instanceof HTMLElement)) return null;
  const rowKey = cell.dataset.gridRow;
  const col = Number(cell.dataset.gridCol);
  return rowKey === undefined || Number.isNaN(col) ? null : { rowKey, col };
}

/** What takes focus for `cell`: its own control or live editor if it has one, otherwise the cell. */
function focusTarget(grid: HTMLElement, cell: GridCell): HTMLElement | null {
  const element = grid.querySelector(
    `[data-grid-row="${CSS.escape(cell.rowKey)}"][data-grid-col="${cell.col}"]`,
  );
  if (!(element instanceof HTMLElement)) return null;
  const inner = element.querySelector("[data-grid-focus], .ProseMirror");
  return inner instanceof HTMLElement ? inner : element;
}

/**
 * The keyboard grid (FR-TBL-11, ADR-0043 point 5): one tab stop, moved by
 * the arrow keys, Home and End, and following focus that arrives by click or
 * Tab. Escape in a cell's editor saves, closes it and returns focus to the
 * cell. Keys typed in an editor, input or select are left to it, as is a key
 * something inside already handled (such as the @ autocomplete's Escape).
 */
export function useGridFocus({
  rows,
  colCount,
  grid,
  scrollToIndex,
  closeEditor,
}: Options): GridFocus {
  const [chosen, setChosen] = useState<GridCell | null>(null);
  // Bumped whenever focus should move to `cell` after the next render.
  const [focusRequest, setFocusRequest] = useState(0);
  const cell = settleCell(rows, colCount, chosen);
  const index =
    cell === null ? -1 : rows.findIndex((row) => row.key === cell.rowKey);
  // Read when a request is handled: only a new request moves focus, not
  // `cell` changing on its own (a filter, say).
  const latestCell = useRef(cell);
  latestCell.current = cell;

  useEffect(() => {
    const target = latestCell.current;
    if (focusRequest === 0 || target === null || grid.current === null) return;
    focusTarget(grid.current, target)?.focus();
  }, [focusRequest, grid]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (event.defaultPrevented || !(target instanceof Element)) return;
    if (target.closest(".ProseMirror") !== null) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void closeEditor().then((closed) => {
        if (closed) setFocusRequest((n) => n + 1);
      });
      return;
    }
    if (target.closest("input, select, textarea") !== null) return;
    const from = cellOf(target);
    if (from === null || !isGridKey(event.key)) return;
    event.preventDefault();
    const next = moveCell(rows, colCount, from, event.key);
    setChosen(next);
    setFocusRequest((n) => n + 1);
    const to = rows.findIndex((row) => row.key === next.rowKey);
    if (to !== -1) scrollToIndex(to);
  }

  function onFocus(event: FocusEvent<HTMLElement>) {
    if (!(event.target instanceof Element)) return;
    const at = cellOf(event.target);
    if (
      at !== null &&
      (at.rowKey !== chosen?.rowKey || at.col !== chosen.col)
    ) {
      setChosen(at);
    }
  }

  return { cell, rowIndex: index === -1 ? null : index, onKeyDown, onFocus };
}
