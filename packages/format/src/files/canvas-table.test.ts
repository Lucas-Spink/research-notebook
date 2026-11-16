import { describe, expect, it } from "vitest";
import type { FormatError, Result } from "../result";
import { parseCanvas, serialiseCanvas } from "./canvas";

/**
 * ADR-0071: a canvas can hold a table of figures. A canvas with a table (or a
 * line to one of its cells) is format version 3; any other canvas stays at 2,
 * so a build that only knows version 2 still opens every canvas without one.
 */

/** A valid ULID (uppercase Crockford Base32, no I, L, O or U) for each number. */
const ulid = (n: number): string => `01J${String(n).padStart(23, "0")}`;
const CANVAS = ulid(1);
const TABLE = ulid(2);
const NOTE = ulid(3);
const FIGURE = ulid(4);
const ROW_A = ulid(5);
const ROW_B = ulid(6);
const COL_A = ulid(7);
const COL_B = ulid(8);
const EXPERIMENT = ulid(9);
const ARTEFACT = ulid(10);
const EDGE = ulid(11);

type Obj = Record<string, unknown>;

function table(over: Obj = {}): Obj {
  return {
    id: TABLE,
    type: "table",
    rows: [
      { id: ROW_A, label: "Replicate 1" },
      { id: ROW_B, label: "Replicate 2" },
    ],
    columns: [
      { id: COL_A, label: "Control" },
      { id: COL_B, label: "Treated" },
    ],
    cells: [
      {
        row: ROW_A,
        column: COL_A,
        experiment_id: EXPERIMENT,
        artefact_id: ARTEFACT,
        version: 2,
        aspect: 1.5,
      },
      {
        row: ROW_B,
        column: COL_B,
        experiment_id: EXPERIMENT,
        artefact_id: ARTEFACT,
      },
    ],
    fit: "row",
    position: { x: 100, y: 100 },
    size: { width: 640, height: 420 },
    ...over,
  };
}

const note = (): Obj => ({
  id: NOTE,
  type: "note",
  text: "Check this one",
  position: { x: 800, y: 100 },
  size: { width: 240, height: 120 },
});

function canvas(over: Obj = {}, nodes: Obj[] = [table(), note()]): Obj {
  return {
    format_version: 3,
    id: CANVAS,
    name: "Replicates",
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    ...over,
  };
}

const text = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function errorOf(result: Result<unknown>): FormatError {
  if (result.ok) throw new Error("expected the file to be rejected");
  return result.error;
}

const messageOf = (file: Obj): string =>
  errorOf(parseCanvas(text(file))).message;

function tableOf(file: Obj): Obj {
  const nodes = file["nodes"] as Obj[];
  const found = nodes.find((node) => node["type"] === "table");
  if (found === undefined) throw new Error("no table");
  return found;
}

describe("a table on a canvas", () => {
  it("reads a table with its headings and the figures in its cells", () => {
    const parsed = parseCanvas(text(canvas()));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const node = parsed.value.nodes.find((n) => n.type === "table");
    expect(node).toMatchObject({
      type: "table",
      fit: "row",
      rows: [{ label: "Replicate 1" }, { label: "Replicate 2" }],
      columns: [{ label: "Control" }, { label: "Treated" }],
    });
    expect(node?.type === "table" && node.cells).toHaveLength(2);
  });

  it("allows an empty table, and cells that are not all filled", () => {
    const empty = canvas({}, [table({ rows: [], columns: [], cells: [] })]);
    expect(parseCanvas(text(empty)).ok).toBe(true);
    const one = canvas({}, [table({ cells: [] })]);
    expect(parseCanvas(text(one)).ok).toBe(true);
  });

  it("keeps unknown keys on a table, its headings and its cells", () => {
    const file = canvas();
    const node = tableOf(file);
    node["x_future"] = 1;
    for (const [list, key, value] of [
      ["rows", "x_row", 2],
      ["cells", "x_cell", 3],
    ] as const) {
      const first = (node[list] as Obj[])[0];
      if (first === undefined) throw new Error(`no ${list}`);
      first[key] = value;
    }
    const parsed = parseCanvas(text(file));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const out = serialiseCanvas(parsed.value);
    for (const key of ["x_future", "x_row", "x_cell"]) {
      expect(out).toContain(`"${key}"`);
    }
  });

  it("writes a table's keys in canonical order", () => {
    const parsed = parseCanvas(text(canvas()));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const written = JSON.parse(serialiseCanvas(parsed.value)) as {
      nodes: Obj[];
    };
    const node = written.nodes.find((n) => n["type"] === "table");
    expect(Object.keys(node ?? {})).toEqual([
      "id",
      "type",
      "rows",
      "columns",
      "cells",
      "fit",
      "position",
      "size",
    ]);
    expect(Object.keys((node?.["cells"] as Obj[])[0] ?? {})).toEqual([
      "row",
      "column",
      "experiment_id",
      "artefact_id",
      "version",
      "aspect",
    ]);
  });

  it("rejects a table in a version 2 file, which cannot hold one", () => {
    expect(messageOf(canvas({ format_version: 2 }))).toMatch(
      /table.*version 3|version 3.*table/i,
    );
  });

  it.each([
    [
      "a row id used twice",
      {
        rows: [
          { id: ROW_A, label: "a" },
          { id: ROW_A, label: "b" },
        ],
      },
      /row id is used more than once/,
    ],
    [
      "a column id used twice",
      {
        columns: [
          { id: COL_A, label: "a" },
          { id: COL_A, label: "b" },
        ],
      },
      /column id is used more than once/,
    ],
  ])("rejects %s", (_name, over, message) => {
    expect(messageOf(canvas({}, [table(over)]))).toMatch(message);
  });

  it("rejects a cell in a row or column the table does not have", () => {
    const cells = [
      {
        row: NOTE,
        column: COL_A,
        experiment_id: EXPERIMENT,
        artefact_id: ARTEFACT,
      },
    ];
    expect(messageOf(canvas({}, [table({ cells })]))).toMatch(
      /row .* not in this table/,
    );
    const other = [
      {
        row: ROW_A,
        column: NOTE,
        experiment_id: EXPERIMENT,
        artefact_id: ARTEFACT,
      },
    ];
    expect(messageOf(canvas({}, [table({ cells: other })]))).toMatch(
      /column .* not in this table/,
    );
  });

  it("rejects two figures in one cell", () => {
    const cell = {
      row: ROW_A,
      column: COL_A,
      experiment_id: EXPERIMENT,
      artefact_id: ARTEFACT,
    };
    expect(
      messageOf(canvas({}, [table({ cells: [cell, { ...cell }] })])),
    ).toMatch(/more than one figure/);
  });

  it.each([
    ["an empty heading", { rows: [{ id: ROW_A, label: "" }] }],
    ["a heading with a line break", { rows: [{ id: ROW_A, label: "a\nb" }] }],
    ["an unknown fit", { fit: "diagonal" }],
    ["a missing fit", { fit: undefined }],
  ])("rejects %s", (_name, over) => {
    expect(messageOf(canvas({}, [table(over)]))).toBeTruthy();
  });

  it.each([0, -1, Number.NaN])("rejects the cell aspect %s", (aspect) => {
    const cell = {
      row: ROW_A,
      column: COL_A,
      experiment_id: EXPERIMENT,
      artefact_id: ARTEFACT,
      aspect,
    };
    expect(parseCanvas(text(canvas({}, [table({ cells: [cell] })]))).ok).toBe(
      false,
    );
  });
});

describe("a line to a table cell", () => {
  const withEdge = (edge: Obj, over: Obj = {}): Obj =>
    canvas({
      edges: [{ id: EDGE, source: NOTE, target: TABLE, ...edge }],
      ...over,
    });

  it("reads a line that ends at one cell", () => {
    const parsed = parseCanvas(
      text(withEdge({ target_cell: { row: ROW_A, column: COL_B } })),
    );
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.value.edges[0]).toMatchObject({
      target_cell: { row: ROW_A, column: COL_B },
    });
  });

  it("reads a line that starts at a cell", () => {
    const file = canvas({
      edges: [
        {
          id: EDGE,
          source: TABLE,
          target: NOTE,
          source_cell: { row: ROW_B, column: COL_A },
        },
      ],
    });
    expect(parseCanvas(text(file)).ok).toBe(true);
  });

  it("writes the cell after the handle and before the label", () => {
    const parsed = parseCanvas(
      text(
        withEdge({
          target_handle: "left",
          target_cell: { row: ROW_A, column: COL_B },
          label: "supports",
        }),
      ),
    );
    if (!parsed.ok) throw new Error(parsed.error.message);
    const written = JSON.parse(serialiseCanvas(parsed.value)) as {
      edges: Obj[];
    };
    expect(Object.keys(written.edges[0] ?? {})).toEqual([
      "id",
      "source",
      "target",
      "target_handle",
      "target_cell",
      "label",
    ]);
  });

  it("rejects a cell that is not in the table the line ends at", () => {
    expect(
      messageOf(withEdge({ target_cell: { row: NOTE, column: COL_B } })),
    ).toMatch(/not in this table/);
  });

  it("rejects a cell on a line whose end is not a table", () => {
    expect(
      messageOf(
        canvas(
          {
            edges: [
              {
                id: EDGE,
                source: NOTE,
                target: FIGURE,
                target_cell: { row: ROW_A, column: COL_A },
              },
            ],
          },
          [
            note(),
            {
              id: FIGURE,
              type: "artefact",
              experiment_id: EXPERIMENT,
              artefact_id: ARTEFACT,
              position: { x: 0, y: 0 },
              size: { width: 10, height: 10 },
            },
            table(),
          ],
        ),
      ),
    ).toMatch(/not a table/);
  });

  it("rejects a cell link in a version 2 file", () => {
    expect(
      parseCanvas(
        text(
          withEdge(
            { target_cell: { row: ROW_A, column: COL_B } },
            { format_version: 2 },
          ),
        ),
      ).ok,
    ).toBe(false);
  });
});

describe("which version a canvas is written at", () => {
  const plain = (version: number): Obj => ({
    format_version: version,
    id: CANVAS,
    name: "Plain",
    nodes: [note()],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  });

  it("is 3 when there is a table", () => {
    const parsed = parseCanvas(text(canvas()));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const out = JSON.parse(
      serialiseCanvas({ ...parsed.value, format_version: 3 }),
    ) as Obj;
    expect(out["format_version"]).toBe(3);
  });

  it("is 2 when there is none, even for a file read as 3, so older builds can open it", () => {
    const parsed = parseCanvas(text(plain(3)));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const out = JSON.parse(serialiseCanvas(parsed.value)) as Obj;
    expect(out["format_version"]).toBe(2);
  });

  it("is 3 when a table is added to a canvas read as 2", () => {
    const parsed = parseCanvas(text(plain(2)));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const withTable = {
      ...parsed.value,
      nodes: [...parsed.value.nodes, table() as never],
    };
    const out = JSON.parse(serialiseCanvas(withTable)) as Obj;
    expect(out["format_version"]).toBe(3);
  });

  it("is 3 for a canvas whose only table feature is a line to a cell", () => {
    expect(parseCanvas(text(canvas())).ok).toBe(true);
    const file = canvas({
      edges: [
        {
          id: EDGE,
          source: NOTE,
          target: TABLE,
          target_cell: { row: ROW_A, column: COL_A },
        },
      ],
    });
    const parsed = parseCanvas(text(file));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const out = JSON.parse(
      serialiseCanvas({ ...parsed.value, format_version: 2 }),
    ) as Obj;
    expect(out["format_version"]).toBe(3);
  });

  it("still reports a version newer than 3 as unsupported", () => {
    expect(errorOf(parseCanvas(text(plain(4)))).kind).toBe(
      "unsupported-version",
    );
  });

  it("still rejects version 1, which never held canvases", () => {
    expect(errorOf(parseCanvas(text(plain(1)))).kind).toBe("schema");
  });
});
