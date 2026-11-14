import { parseCanvas, serialiseCanvas } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { newCanvasFile } from "./canvasFiles";
import { addNote } from "./notes";
import {
  COLUMN_HEADER_HEIGHT,
  DEFAULT_ASPECT,
  DEFAULT_TABLE,
  ROW_HEADER_WIDTH,
  addTable,
  applyTableChange,
  fillCells,
  layoutTable,
  tableNodes,
  type TableNode,
} from "./tables";

/** ADR-0071: a table of figures on the canvas, edited by pure functions of the file. */

const CANVAS = "01JAXC0000000000000000CNV1";
const EXP = "01JAXE000000000000000000A1";
const art = (n: number) =>
  `01JAXA00000000000000000A${String(n).padStart(2, "0")}`;
const ref = (n: number, version?: number) => ({
  experimentId: EXP,
  artefactId: art(n),
  ...(version === undefined ? {} : { version }),
});

let counter = 0;
const newId = () => `01JAXN${String(++counter).padStart(20, "0")}`;
const labels = { rows: ["Row 1", "Row 2"], columns: ["Column 1", "Column 2"] };

function withTable(rows = 2, columns = 2) {
  const file = addTable(newCanvasFile(CANVAS, "C"), { x: 500, y: 400 }, newId, {
    rows: Array.from({ length: rows }, (_, i) => `Row ${i + 1}`),
    columns: Array.from({ length: columns }, (_, i) => `Column ${i + 1}`),
  });
  const [table] = tableNodes(file);
  if (table === undefined) throw new Error("no table");
  return { file, table };
}

const tableOf = (file: ReturnType<typeof withTable>["file"]): TableNode => {
  const [table] = tableNodes(file);
  if (table === undefined) throw new Error("no table");
  return table;
};

describe("addTable", () => {
  it("adds a table centred on the point, with the headings and an id for each row and column", () => {
    const { file, table } = withTable();
    expect(table.rows.map((r) => r.label)).toEqual(["Row 1", "Row 2"]);
    expect(table.columns.map((c) => c.label)).toEqual(["Column 1", "Column 2"]);
    expect(table.cells).toEqual([]);
    expect(table.fit).toBe("row");
    expect(table.size).toEqual(DEFAULT_TABLE);
    expect(table.position).toEqual({
      x: Math.round(500 - DEFAULT_TABLE.width / 2),
      y: Math.round(400 - DEFAULT_TABLE.height / 2),
    });
    const ids = [
      table.id,
      ...table.rows.map((r) => r.id),
      ...table.columns.map((c) => c.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(file.nodes).toHaveLength(1);
  });

  it("makes the canvas version 3, which a canvas holding a table must be", () => {
    expect(withTable().file.format_version).toBe(3);
  });

  it("writes a file the format accepts, and keeps the other cards", () => {
    const base = addNote(newCanvasFile(CANVAS, "C"), { x: 0, y: 0 }, newId);
    const file = addTable(base, { x: 500, y: 400 }, newId, labels);
    expect(file.nodes.map((n) => n.type)).toEqual(["note", "table"]);
    expect(parseCanvas(serialiseCanvas(file)).ok).toBe(true);
  });

  it("does not change the file it was given", () => {
    const base = newCanvasFile(CANVAS, "C");
    addTable(base, { x: 0, y: 0 }, newId, labels);
    expect(base.nodes).toEqual([]);
    expect(base.format_version).toBe(2);
  });
});

describe("rows and columns", () => {
  it("adds a row at the bottom and a column at the right, with the given heading", () => {
    const { file, table } = withTable();
    let next = applyTableChange(file, table.id, {
      kind: "addRow",
      id: newId(),
      label: "Row 3",
    });
    next = applyTableChange(next, table.id, {
      kind: "addColumn",
      id: newId(),
      label: "Column 3",
    });
    expect(tableOf(next).rows.map((r) => r.label)).toEqual([
      "Row 1",
      "Row 2",
      "Row 3",
    ]);
    expect(tableOf(next).columns.map((c) => c.label)).toEqual([
      "Column 1",
      "Column 2",
      "Column 3",
    ]);
  });

  it("removes a row with its figures", () => {
    const { file, table } = withTable();
    const [r1, r2] = table.rows;
    const [c1] = table.columns;
    if (!r1 || !r2 || !c1) throw new Error("fixture");
    let next = applyTableChange(file, table.id, {
      kind: "setCell",
      row: r1.id,
      column: c1.id,
      ref: ref(1),
    });
    next = applyTableChange(next, table.id, {
      kind: "setCell",
      row: r2.id,
      column: c1.id,
      ref: ref(2),
    });
    next = applyTableChange(next, table.id, { kind: "removeRow", id: r1.id });
    expect(tableOf(next).rows.map((r) => r.id)).toEqual([r2.id]);
    expect(tableOf(next).cells.map((c) => c.artefact_id)).toEqual([art(2)]);
  });

  it("removes a column with its figures", () => {
    const { file, table } = withTable();
    const [r1] = table.rows;
    const [c1, c2] = table.columns;
    if (!r1 || !c1 || !c2) throw new Error("fixture");
    let next = applyTableChange(file, table.id, {
      kind: "setCell",
      row: r1.id,
      column: c1.id,
      ref: ref(1),
    });
    next = applyTableChange(next, table.id, {
      kind: "setCell",
      row: r1.id,
      column: c2.id,
      ref: ref(2),
    });
    next = applyTableChange(next, table.id, {
      kind: "removeColumn",
      id: c2.id,
    });
    expect(tableOf(next).columns.map((c) => c.id)).toEqual([c1.id]);
    expect(tableOf(next).cells.map((c) => c.artefact_id)).toEqual([art(1)]);
  });

  it("removes the lines that ended at a cell of the removed row or column, and no others", () => {
    const { file, table } = withTable();
    const [r1, r2] = table.rows;
    const [c1] = table.columns;
    if (!r1 || !r2 || !c1) throw new Error("fixture");
    const noted = addNote(file, { x: 0, y: 0 }, () =>
      "01JAXN0000000000000000NOTE".replace("T", "7"),
    );
    const note = noted.nodes[noted.nodes.length - 1];
    if (note === undefined) throw new Error("no note");
    const edge = (id: string, row: string) => ({
      id,
      source: note.id,
      target: table.id,
      target_cell: { row, column: c1.id },
    });
    const lined = {
      ...noted,
      edges: [
        edge("01JAXE0000000000000000ED01", r1.id),
        edge("01JAXE0000000000000000ED02", r2.id),
      ],
    };
    const next = applyTableChange(lined, table.id, {
      kind: "removeRow",
      id: r1.id,
    });
    expect(next.edges.map((e) => e.id)).toEqual(["01JAXE0000000000000000ED02"]);
  });

  it("renames a heading without touching the figures that sit under it", () => {
    const { file, table } = withTable();
    const [r1] = table.rows;
    const [c1] = table.columns;
    if (!r1 || !c1) throw new Error("fixture");
    let next = applyTableChange(file, table.id, {
      kind: "setCell",
      row: r1.id,
      column: c1.id,
      ref: ref(1),
    });
    next = applyTableChange(next, table.id, {
      kind: "heading",
      line: "row",
      id: r1.id,
      label: "Replicate 1",
    });
    next = applyTableChange(next, table.id, {
      kind: "heading",
      line: "column",
      id: c1.id,
      label: "Control",
    });
    expect(tableOf(next).rows[0]?.label).toBe("Replicate 1");
    expect(tableOf(next).columns[0]?.label).toBe("Control");
    expect(tableOf(next).cells).toHaveLength(1);
  });

  it.each(["", "   ", "a\nb"])(
    "refuses the heading %j, which the file cannot hold",
    (label) => {
      const { file, table } = withTable();
      const [r1] = table.rows;
      if (!r1) throw new Error("fixture");
      const next = applyTableChange(file, table.id, {
        kind: "heading",
        line: "row",
        id: r1.id,
        label,
      });
      expect(next).toBe(file);
    },
  );

  it("does nothing for a table, row or column that is not there", () => {
    const { file, table } = withTable();
    expect(
      applyTableChange(file, "nope", {
        kind: "addRow",
        id: newId(),
        label: "x",
      }),
    ).toBe(file);
    expect(
      applyTableChange(file, table.id, { kind: "removeRow", id: "nope" }),
    ).toBe(file);
    expect(
      applyTableChange(file, table.id, { kind: "removeColumn", id: "nope" }),
    ).toBe(file);
  });
});

describe("cells", () => {
  it("puts a result in a cell, with its version when it has one", () => {
    const { file, table } = withTable();
    const [r1] = table.rows;
    const [, c2] = table.columns;
    if (!r1 || !c2) throw new Error("fixture");
    const next = applyTableChange(file, table.id, {
      kind: "setCell",
      row: r1.id,
      column: c2.id,
      ref: ref(1, 3),
    });
    expect(tableOf(next).cells).toEqual([
      {
        row: r1.id,
        column: c2.id,
        experiment_id: EXP,
        artefact_id: art(1),
        version: 3,
      },
    ]);
  });

  it("replaces the figure that was in the cell, and forgets its shape", () => {
    const { file, table } = withTable();
    const [r1] = table.rows;
    const [c1] = table.columns;
    if (!r1 || !c1) throw new Error("fixture");
    let next = applyTableChange(file, table.id, {
      kind: "setCell",
      row: r1.id,
      column: c1.id,
      ref: ref(1),
    });
    next = applyTableChange(next, table.id, {
      kind: "aspect",
      row: r1.id,
      column: c1.id,
      aspect: 2,
    });
    next = applyTableChange(next, table.id, {
      kind: "setCell",
      row: r1.id,
      column: c1.id,
      ref: ref(2),
    });
    expect(tableOf(next).cells).toEqual([
      { row: r1.id, column: c1.id, experiment_id: EXP, artefact_id: art(2) },
    ]);
  });

  it("clears a cell, and a cell that is already empty is no change", () => {
    const { file, table } = withTable();
    const [r1] = table.rows;
    const [c1] = table.columns;
    if (!r1 || !c1) throw new Error("fixture");
    const filled = applyTableChange(file, table.id, {
      kind: "setCell",
      row: r1.id,
      column: c1.id,
      ref: ref(1),
    });
    const cleared = applyTableChange(filled, table.id, {
      kind: "clearCell",
      row: r1.id,
      column: c1.id,
    });
    expect(tableOf(cleared).cells).toEqual([]);
    expect(
      applyTableChange(cleared, table.id, {
        kind: "clearCell",
        row: r1.id,
        column: c1.id,
      }),
    ).toBe(cleared);
  });

  it("refuses a cell outside the table", () => {
    const { file, table } = withTable();
    const [r1] = table.rows;
    if (!r1) throw new Error("fixture");
    expect(
      applyTableChange(file, table.id, {
        kind: "setCell",
        row: r1.id,
        column: "nope",
        ref: ref(1),
      }),
    ).toBe(file);
  });

  it("records a picture's shape once, and ignores a shape it cannot use", () => {
    const { file, table } = withTable();
    const [r1] = table.rows;
    const [c1] = table.columns;
    if (!r1 || !c1) throw new Error("fixture");
    const filled = applyTableChange(file, table.id, {
      kind: "setCell",
      row: r1.id,
      column: c1.id,
      ref: ref(1),
    });
    const shaped = applyTableChange(filled, table.id, {
      kind: "aspect",
      row: r1.id,
      column: c1.id,
      aspect: 1.5,
    });
    expect(tableOf(shaped).cells[0]?.aspect).toBe(1.5);
    expect(
      applyTableChange(shaped, table.id, {
        kind: "aspect",
        row: r1.id,
        column: c1.id,
        aspect: 1.5,
      }),
    ).toBe(shaped);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        applyTableChange(shaped, table.id, {
          kind: "aspect",
          row: r1.id,
          column: c1.id,
          aspect: bad,
        }),
      ).toBe(shaped);
    }
  });

  it("ignores the shape of an empty cell", () => {
    const { file, table } = withTable();
    const [r1] = table.rows;
    const [c1] = table.columns;
    if (!r1 || !c1) throw new Error("fixture");
    expect(
      applyTableChange(file, table.id, {
        kind: "aspect",
        row: r1.id,
        column: c1.id,
        aspect: 2,
      }),
    ).toBe(file);
  });

  it("switches what sets the cells' shape", () => {
    const { file, table } = withTable();
    const next = applyTableChange(file, table.id, {
      kind: "fit",
      fit: "column",
    });
    expect(tableOf(next).fit).toBe("column");
    expect(
      applyTableChange(next, table.id, { kind: "fit", fit: "column" }),
    ).toBe(next);
  });
});

describe("fillCells", () => {
  it("fills the cell dropped on, then the next empty cells along the row and down", () => {
    const { file, table } = withTable(2, 2);
    const [r1, r2] = table.rows;
    const [c1, c2] = table.columns;
    if (!r1 || !r2 || !c1 || !c2) throw new Error("fixture");
    const { file: next, placed } = fillCells(
      file,
      table.id,
      { row: r1.id, column: c2.id },
      [ref(1), ref(2), ref(3)],
    );
    expect(placed).toBe(3);
    const at = (r: string, c: string) =>
      tableOf(next).cells.find((cell) => cell.row === r && cell.column === c)
        ?.artefact_id;
    expect(at(r1.id, c2.id)).toBe(art(1));
    expect(at(r2.id, c1.id)).toBe(art(2));
    expect(at(r2.id, c2.id)).toBe(art(3));
  });

  it("skips cells that already hold a figure, except the one dropped on, which it replaces", () => {
    const { file, table } = withTable(1, 3);
    const [r1] = table.rows;
    const [c1, c2, c3] = table.columns;
    if (!r1 || !c1 || !c2 || !c3) throw new Error("fixture");
    const held = applyTableChange(file, table.id, {
      kind: "setCell",
      row: r1.id,
      column: c2.id,
      ref: ref(9),
    });
    const { file: next, placed } = fillCells(
      held,
      table.id,
      { row: r1.id, column: c1.id },
      [ref(1), ref(2)],
    );
    expect(placed).toBe(2);
    const at = (c: string) =>
      tableOf(next).cells.find((cell) => cell.column === c)?.artefact_id;
    expect(at(c1.id)).toBe(art(1));
    expect(at(c2.id)).toBe(art(9));
    expect(at(c3.id)).toBe(art(2));
    const replaced = fillCells(held, table.id, { row: r1.id, column: c2.id }, [
      ref(5),
    ]);
    expect(replaced.file.nodes.length).toBe(held.nodes.length);
    expect(
      tableOf(replaced.file).cells.find((cell) => cell.column === c2.id)
        ?.artefact_id,
    ).toBe(art(5));
  });

  it("places only as many as there is room for, and says how many", () => {
    const { file, table } = withTable(1, 2);
    const [r1] = table.rows;
    const [c1] = table.columns;
    if (!r1 || !c1) throw new Error("fixture");
    const { placed } = fillCells(
      file,
      table.id,
      { row: r1.id, column: c1.id },
      [ref(1), ref(2), ref(3)],
    );
    expect(placed).toBe(2);
  });

  it("changes nothing when dropped on a cell the table does not have", () => {
    const { file, table } = withTable();
    const result = fillCells(file, table.id, { row: "nope", column: "nope" }, [
      ref(1),
    ]);
    expect(result.file).toBe(file);
    expect(result.placed).toBe(0);
  });

  it("produces a file the format accepts", () => {
    const { file, table } = withTable(2, 2);
    const [r1] = table.rows;
    const [c1] = table.columns;
    if (!r1 || !c1) throw new Error("fixture");
    const { file: next } = fillCells(
      file,
      table.id,
      { row: r1.id, column: c1.id },
      [ref(1, 2), ref(2)],
    );
    expect(parseCanvas(serialiseCanvas(next)).ok).toBe(true);
  });
});

describe("layoutTable", () => {
  const make = (
    fit: "row" | "column",
    rows: number,
    columns: number,
    aspects: Record<string, number>,
    width = 600,
  ): TableNode => {
    const { table } = withTable(rows, columns);
    const cells = Object.entries(aspects).map(([key, aspect], index) => {
      const [r, c] = key.split(",").map(Number);
      const row = table.rows[r ?? 0];
      const column = table.columns[c ?? 0];
      if (!row || !column) throw new Error("fixture");
      return {
        row: row.id,
        column: column.id,
        experiment_id: EXP,
        artefact_id: art(index + 1),
        aspect,
      };
    });
    return { ...table, fit, cells, size: { width, height: 100 } };
  };

  it("gives an empty table just its headings", () => {
    const { table } = withTable(0, 0);
    const layout = layoutTable(table);
    expect(layout.rowHeights).toEqual([]);
    expect(layout.columnWidths).toEqual([]);
    expect(layout.height).toBe(COLUMN_HEADER_HEIGHT);
    expect(layout.width).toBe(DEFAULT_TABLE.width);
  });

  it("with fit by row: columns share the width, and each row is as tall as its tallest figure needs", () => {
    const table = make("row", 2, 2, { "0,0": 2, "0,1": 1, "1,0": 2 });
    const layout = layoutTable(table);
    const inner = 600 - ROW_HEADER_WIDTH;
    expect(layout.columnWidths).toEqual([inner / 2, inner / 2]);
    // Row 1 holds a 2:1 and a 1:1 picture: the 1:1 one is the tallest, so it sets the height.
    expect(layout.rowHeights[0]).toBe(Math.round(inner / 2 / 1));
    expect(layout.rowHeights[1]).toBe(Math.round(inner / 2 / 2));
    expect(layout.height).toBe(
      COLUMN_HEADER_HEIGHT +
        (layout.rowHeights[0] ?? 0) +
        (layout.rowHeights[1] ?? 0),
    );
  });

  it("with fit by row: a row with no figure, or none whose shape is known, takes the default shape", () => {
    const table = make("row", 2, 2, { "0,0": 2 });
    const layout = layoutTable(table);
    const colWidth = (600 - ROW_HEADER_WIDTH) / 2;
    expect(layout.rowHeights[1]).toBe(Math.round(colWidth / DEFAULT_ASPECT));
  });

  it("with fit by column: rows share the height, and each column is as wide as its tallest figure needs", () => {
    const table = make("column", 2, 2, { "0,0": 2, "1,0": 1, "0,1": 1 });
    const layout = layoutTable(table);
    const inner = 600 - ROW_HEADER_WIDTH;
    // Column 1's shape is its tallest, 1:1; column 2's is 1:1 too: both equal.
    expect(layout.rowHeights[0]).toBe(layout.rowHeights[1]);
    const total = (layout.columnWidths[0] ?? 0) + (layout.columnWidths[1] ?? 0);
    expect(Math.abs(total - inner)).toBeLessThanOrEqual(2);
  });

  it("with fit by column: a column of identical figures is exactly as wide as that picture needs at the common height", () => {
    const table = make("column", 2, 2, {
      "0,0": 2,
      "1,0": 2,
      "0,1": 0.5,
      "1,1": 0.5,
    });
    const layout = layoutTable(table);
    const h = layout.rowHeights[0] ?? 0;
    expect(Math.abs((layout.columnWidths[0] ?? 0) - 2 * h)).toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs((layout.columnWidths[1] ?? 0) - 0.5 * h),
    ).toBeLessThanOrEqual(1);
  });

  it("is whole pixels and never negative, even for a very narrow table", () => {
    const table = make("row", 2, 3, { "0,0": 3 }, 60);
    const layout = layoutTable(table);
    for (const n of [
      ...layout.rowHeights,
      ...layout.columnWidths,
      layout.width,
      layout.height,
    ]) {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });
});
