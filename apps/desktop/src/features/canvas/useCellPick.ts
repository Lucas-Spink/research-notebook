import { useRef, type PointerEvent } from "react";
import { useCard } from "./CardContext";
import { cellId, cellsBetween } from "./model/cellNotes";
import type { CellRef, TableNode } from "./model/tables";

/** Things inside a cell that are for clicking, not for picking the cell. */
const OWN_CONTROLS = "button, input, select, textarea";

/**
 * Picking cells of a table to make a note about them: a click picks one, Ctrl
 * or Shift-click adds or takes away one, and dragging across cells picks the
 * rectangle between. What is picked lives with the surface and is never saved.
 */
export function useCellPick(table: TableNode) {
  const { picked, onPick, editable } = useCard();
  const anchor = useRef<CellRef | null>(null);
  const mine = picked?.table === table.id ? picked.cells : [];

  const down = (cell: CellRef, event: PointerEvent) => {
    const target = event.target;
    if (
      !editable ||
      event.button !== 0 ||
      (target instanceof Element && target.closest(OWN_CONTROLS) !== null)
    ) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      const has = mine.some((c) => cellId(c) === cellId(cell));
      onPick(
        table.id,
        has ? mine.filter((c) => cellId(c) !== cellId(cell)) : [...mine, cell],
      );
      anchor.current = null;
      return;
    }
    anchor.current = cell;
    onPick(table.id, [cell]);
  };

  const enter = (cell: CellRef, event: PointerEvent) => {
    const from = anchor.current;
    if (from === null) return;
    if (event.buttons !== 1) {
      anchor.current = null;
      return;
    }
    onPick(table.id, cellsBetween(table, from, cell));
  };

  return {
    cells: mine,
    keys: new Set(mine.map(cellId)),
    down,
    enter,
  };
}
