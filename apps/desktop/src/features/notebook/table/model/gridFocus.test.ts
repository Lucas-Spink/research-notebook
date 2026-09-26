import { arrangeNotebook } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { sampleNotebook } from "../../model/fakeApi";
import { isGridKey, moveCell, settleCell, type GridCell } from "./gridFocus";
import { buildRows, type TableRow } from "./rows";

/**
 * FR-TBL-11 and ADR-0043 point 5: arrow keys move one focused cell around
 * the grid's experiment rows. Question header and "no matches" rows are
 * passed over; their own buttons stay ordinary tab stops.
 */

// Real rows from the sample notebook, re-keyed: focus reads only `kind` and `key`.
const built = buildRows(arrangeNotebook(sampleNotebook().state), {
  collapsed: new Set(),
  sort: null,
  filter: { text: "", status: "all" },
});
const sampleHeader = built.find((row) => row.kind === "header");
const sampleExperiment = built.find((row) => row.kind === "experiment");
if (sampleHeader === undefined || sampleExperiment === undefined) {
  throw new Error("sample");
}
const header = (key: string): TableRow => ({ ...sampleHeader, key });
const experiment = (key: string): TableRow => ({ ...sampleExperiment, key });
const empty = (key: string): TableRow => ({ kind: "empty", key });

const rows: TableRow[] = [
  header("q1"),
  experiment("e1"),
  experiment("e2"),
  header("q2"),
  empty("none"),
  header("q3"),
  experiment("e3"),
];
const COLUMNS = 6;

const at = (rowKey: string, col: number): GridCell => ({ rowKey, col });

describe("isGridKey", () => {
  it("recognises the arrow keys, Home and End, and nothing else", () => {
    for (const key of [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
    ]) {
      expect(isGridKey(key)).toBe(true);
    }
    for (const key of ["Enter", "Tab", "a", "PageDown", "Escape"]) {
      expect(isGridKey(key)).toBe(false);
    }
  });
});

describe("moveCell", () => {
  it("moves down and up between experiment rows, passing over headers and empty rows", () => {
    expect(moveCell(rows, COLUMNS, at("e1", 2), "ArrowDown")).toEqual(
      at("e2", 2),
    );
    expect(moveCell(rows, COLUMNS, at("e2", 2), "ArrowDown")).toEqual(
      at("e3", 2),
    );
    expect(moveCell(rows, COLUMNS, at("e3", 2), "ArrowUp")).toEqual(
      at("e2", 2),
    );
  });

  it("stays put at the first and last experiment rows", () => {
    expect(moveCell(rows, COLUMNS, at("e1", 1), "ArrowUp")).toEqual(
      at("e1", 1),
    );
    expect(moveCell(rows, COLUMNS, at("e3", 1), "ArrowDown")).toEqual(
      at("e3", 1),
    );
  });

  it("moves left and right within the row, stopping at its ends", () => {
    expect(moveCell(rows, COLUMNS, at("e1", 2), "ArrowRight")).toEqual(
      at("e1", 3),
    );
    expect(moveCell(rows, COLUMNS, at("e1", 2), "ArrowLeft")).toEqual(
      at("e1", 1),
    );
    expect(moveCell(rows, COLUMNS, at("e1", 0), "ArrowLeft")).toEqual(
      at("e1", 0),
    );
    expect(moveCell(rows, COLUMNS, at("e1", 5), "ArrowRight")).toEqual(
      at("e1", 5),
    );
  });

  it("goes to the first and last cell of the row on Home and End", () => {
    expect(moveCell(rows, COLUMNS, at("e2", 3), "Home")).toEqual(at("e2", 0));
    expect(moveCell(rows, COLUMNS, at("e2", 3), "End")).toEqual(at("e2", 5));
  });
});

describe("settleCell", () => {
  it("starts at the first experiment row's first cell", () => {
    expect(settleCell(rows, COLUMNS, null)).toEqual(at("e1", 0));
  });

  it("keeps a cell that is still there", () => {
    expect(settleCell(rows, COLUMNS, at("e2", 4))).toEqual(at("e2", 4));
  });

  it("pulls the column back in when columns are hidden", () => {
    expect(settleCell(rows, 3, at("e2", 5))).toEqual(at("e2", 2));
  });

  it("goes back to the first cell when the row is filtered out or collapsed away", () => {
    expect(settleCell(rows, COLUMNS, at("gone", 2))).toEqual(at("e1", 0));
    expect(settleCell(rows, COLUMNS, at("q1", 0))).toEqual(at("e1", 0));
  });

  it("has no cell when no experiment is shown", () => {
    expect(settleCell([header("q1"), empty("none")], COLUMNS, null)).toBeNull();
  });
});
