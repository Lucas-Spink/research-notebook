import { describe, expect, it } from "vitest";
import { newCanvasFile } from "./canvasFiles";
import {
  addNoteForCells,
  cellCountByNote,
  cellLineIds,
  cellsBetween,
  highlightedCells,
  notesByCell,
} from "./cellNotes";
import { addTable, applyTableChange, tableNodes } from "./tables";

/** ADR-0071: a note about some cells of a table is a note and one line to each cell. */

let counter = 0;
const newId = () => `01JAXN${String(++counter).padStart(20, "0")}`;
const fresh = (n: number) => Array.from({ length: n }, () => newId());

function sample(rows = 3, columns = 3) {
  const file = addTable(
    newCanvasFile("01JAXC0000000000000000CNV1", "C"),
    { x: 500, y: 400 },
    newId,
    {
      rows: Array.from({ length: rows }, (_, i) => `R${i + 1}`),
      columns: Array.from({ length: columns }, (_, i) => `C${i + 1}`),
    },
  );
  const [table] = tableNodes(file);
  if (table === undefined) throw new Error("no table");
  const cell = (r: number, c: number) => ({
    row: table.rows[r]?.id ?? "",
    column: table.columns[c]?.id ?? "",
  });
  return { file, table, cell };
}

describe("cellsBetween", () => {
  it("is the rectangle between two corners in either order, in reading order", () => {
    const { table, cell } = sample();
    const expected = [cell(0, 1), cell(0, 2), cell(1, 1), cell(1, 2)];
    expect(cellsBetween(table, cell(0, 1), cell(1, 2))).toEqual(expected);
    expect(cellsBetween(table, cell(1, 2), cell(0, 1))).toEqual(expected);
    expect(cellsBetween(table, cell(2, 2), cell(2, 2))).toEqual([cell(2, 2)]);
  });

  it("is empty when a corner is not in the table", () => {
    const { table, cell } = sample();
    expect(
      cellsBetween(table, cell(0, 0), {
        row: "nope",
        column: cell(0, 0).column,
      }),
    ).toEqual([]);
  });
});

describe("addNoteForCells", () => {
  it("adds one empty note beside the table and a line from it to each cell", () => {
    const { file, table, cell } = sample();
    const ids = fresh(3);
    const next = addNoteForCells(file, table.id, [cell(0, 0), cell(1, 2)], ids);
    const note = next.nodes.find((n) => n.type === "note");
    expect(note).toMatchObject({ id: ids[0], text: "" });
    expect(note?.position.x).toBeGreaterThan(
      table.position.x + table.size.width,
    );
    expect(next.edges.map((e) => [e.source, e.target, e.target_cell])).toEqual([
      [ids[0], table.id, cell(0, 0)],
      [ids[0], table.id, cell(1, 2)],
    ]);
    expect(next.edges.map((e) => e.id)).toEqual([ids[1], ids[2]]);
    expect(next.format_version).toBe(3);
  });

  it("counts a cell once and gives the same result when applied again", () => {
    const { file, table, cell } = sample();
    const ids = fresh(3);
    const once = addNoteForCells(file, table.id, [cell(0, 0), cell(0, 0)], ids);
    expect(once.edges).toHaveLength(1);
    expect(
      addNoteForCells(file, table.id, [cell(0, 0), cell(0, 0)], ids),
    ).toEqual(once);
  });

  it("changes nothing for no cells, a cell the table lacks, a missing table or too few ids", () => {
    const { file, table, cell } = sample();
    expect(addNoteForCells(file, table.id, [], fresh(2))).toBe(file);
    expect(
      addNoteForCells(file, table.id, [{ row: "x", column: "y" }], fresh(2)),
    ).toBe(file);
    expect(addNoteForCells(file, "missing", [cell(0, 0)], fresh(2))).toBe(file);
    expect(
      addNoteForCells(file, table.id, [cell(0, 0), cell(0, 1)], fresh(2)),
    ).toBe(file);
  });

  it("puts a second note about the same table in a different place", () => {
    const { file, table, cell } = sample();
    let next = addNoteForCells(file, table.id, [cell(0, 0)], fresh(2));
    next = addNoteForCells(next, table.id, [cell(1, 1)], fresh(2));
    const [a, b] = next.nodes.filter((n) => n.type === "note");
    expect(a?.position).not.toEqual(b?.position);
  });
});

describe("reading the links back", () => {
  function linked() {
    const { file, table, cell } = sample();
    const first = fresh(3);
    const second = fresh(2);
    let next = addNoteForCells(file, table.id, [cell(0, 0), cell(1, 1)], first);
    next = addNoteForCells(next, table.id, [cell(0, 0)], second);
    return { next, table, cell, first, second };
  }

  it("outlines the cells of the selected notes only", () => {
    const { next, table, cell, first, second } = linked();
    const only = highlightedCells(next, new Set([second[0] ?? ""]));
    expect([...(only.get(table.id) ?? [])]).toEqual([
      `${cell(0, 0).row}/${cell(0, 0).column}`,
    ]);
    expect(
      highlightedCells(next, new Set([first[0] ?? ""])).get(table.id)?.size,
    ).toBe(2);
    expect(highlightedCells(next, new Set()).size).toBe(0);
  });

  it("lists the notes about each cell and the cells of each note", () => {
    const { next, table, cell, first, second } = linked();
    const key = `${table.id}:${cell(0, 0).row}/${cell(0, 0).column}`;
    expect(notesByCell(next).get(key)).toEqual([first[0], second[0]]);
    expect(cellCountByNote(next).get(first[0] ?? "")).toBe(2);
    expect(cellCountByNote(next).get(second[0] ?? "")).toBe(1);
  });

  it("finds the lines of a note to cells, and none for one without", () => {
    const { next, first } = linked();
    expect(cellLineIds(next, first[0] ?? "")).toEqual([first[1], first[2]]);
    expect(cellLineIds(next, "nope")).toEqual([]);
  });

  it("forgets a note's cells when their row is removed", () => {
    const { next, table, cell } = linked();
    const after = applyTableChange(next, table.id, {
      kind: "removeRow",
      id: cell(0, 0).row,
    });
    expect(notesByCell(after).size).toBe(1);
  });
});
