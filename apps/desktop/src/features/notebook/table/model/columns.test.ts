import { describe, expect, it } from "vitest";
import { sampleNotebook } from "../../model/fakeApi";
import {
  EXPERIMENT_COLUMN_WIDTH,
  MAX_WIDTH,
  MIN_WIDTH,
  clampWidth,
  columnLayout,
  gridColumns,
  gridWidth,
  keyboardWidth,
  mergeOverlay,
  motivationColumn,
  withOverlay,
} from "./columns";

/** FR-TBL-04: which columns show, how wide, from project.yaml. */

const { state, first, second } = sampleNotebook();
const table = state.project.table;

describe("columnLayout", () => {
  it("lists every column in the order project.yaml stores them, with its width and visibility", () => {
    expect(columnLayout(table)).toEqual([
      { key: "motivation", width: 220, hidden: false },
      { key: "methods", width: 260, hidden: false },
      { key: "results", width: 280, hidden: false },
      { key: "results_notes", width: 300, hidden: false },
      { key: "interpretation", width: 320, hidden: false },
      { key: "literature", width: 240, hidden: false },
    ]);
  });

  it("follows a different stored order", () => {
    const reordered = { ...table, columns: [...table.columns].reverse() };
    expect(columnLayout(reordered).map((c) => c.key)).toEqual([
      "literature",
      "interpretation",
      "results_notes",
      "results",
      "methods",
      "motivation",
    ]);
  });

  it("keeps a width the format allows but the table cannot show inside the limits", () => {
    const odd = {
      ...table,
      columns: table.columns.map((c) =>
        c.key === "methods"
          ? { ...c, width: 1 }
          : c.key === "results"
            ? { ...c, width: 99999 }
            : c,
      ),
    };
    const layout = columnLayout(odd);
    expect(layout.find((c) => c.key === "methods")?.width).toBe(MIN_WIDTH);
    expect(layout.find((c) => c.key === "results")?.width).toBe(MAX_WIDTH);
  });
});

describe("gridColumns", () => {
  it("leaves out hidden columns and Motivation, which is shown in the question header", () => {
    const hidden = withOverlay(table, { hidden: { results: true } });
    expect(gridColumns(columnLayout(hidden)).map((c) => c.key)).toEqual([
      "methods",
      "results_notes",
      "interpretation",
      "literature",
    ]);
  });

  it("finds the Motivation column only while it is shown", () => {
    expect(motivationColumn(columnLayout(table))?.width).toBe(220);
    const hidden = withOverlay(table, { hidden: { motivation: true } });
    expect(motivationColumn(columnLayout(hidden))).toBeUndefined();
  });

  it("adds up the width of the experiment column and every column shown", () => {
    const columns = gridColumns(columnLayout(table));
    expect(gridWidth(columns)).toBe(
      EXPERIMENT_COLUMN_WIDTH + 260 + 280 + 300 + 320 + 240,
    );
    expect(gridWidth([])).toBe(EXPERIMENT_COLUMN_WIDTH);
  });
});

describe("clampWidth", () => {
  it("rounds to whole pixels and keeps within the limits", () => {
    expect(clampWidth(150.6)).toBe(151);
    expect(clampWidth(0)).toBe(MIN_WIDTH);
    expect(clampWidth(-40)).toBe(MIN_WIDTH);
    expect(clampWidth(1e9)).toBe(MAX_WIDTH);
    expect(clampWidth(Number.NaN)).toBe(MIN_WIDTH);
  });
});

describe("withOverlay and mergeOverlay", () => {
  it("shows changes that are not saved yet without altering the saved table", () => {
    const shown = withOverlay(table, {
      widths: { methods: 400 },
      hidden: { literature: true },
      collapsed: { [first]: true },
    });
    expect(shown.columns.find((c) => c.key === "methods")?.width).toBe(400);
    expect(shown.columns.find((c) => c.key === "literature")?.hidden).toBe(
      true,
    );
    expect(shown.collapsed_questions).toEqual([first]);
    expect(table.collapsed_questions).toEqual([]);
    expect(table.columns.find((c) => c.key === "methods")?.width).toBe(260);
  });

  it("collapses and expands, listing a question once", () => {
    const once = withOverlay(table, {
      collapsed: { [first]: true, [second]: true },
    });
    expect(once.collapsed_questions).toEqual([first, second]);
    const again = withOverlay(once, {
      collapsed: { [first]: true, [second]: false },
    });
    expect(again.collapsed_questions).toEqual([first]);
  });

  it("merges two sets of changes, the later winning", () => {
    expect(
      mergeOverlay(
        {
          widths: { methods: 300, results: 310 },
          collapsed: { [first]: true },
        },
        {
          widths: { methods: 350 },
          hidden: { results: true },
          collapsed: { [first]: false },
        },
      ),
    ).toEqual({
      widths: { methods: 350, results: 310 },
      hidden: { results: true },
      collapsed: { [first]: false },
    });
    expect(mergeOverlay({}, {})).toEqual({});
  });
});

describe("keyboardWidth", () => {
  it("widens and narrows a column with the arrow keys, more with Shift", () => {
    expect(keyboardWidth(300, "ArrowRight", false)).toBe(310);
    expect(keyboardWidth(300, "ArrowLeft", false)).toBe(290);
    expect(keyboardWidth(300, "ArrowRight", true)).toBe(350);
    expect(keyboardWidth(300, "ArrowLeft", true)).toBe(250);
  });

  it("goes to the limits with Home and End, and never beyond them", () => {
    expect(keyboardWidth(300, "Home", false)).toBe(MIN_WIDTH);
    expect(keyboardWidth(300, "End", false)).toBe(MAX_WIDTH);
    expect(keyboardWidth(MIN_WIDTH, "ArrowLeft", true)).toBe(MIN_WIDTH);
    expect(keyboardWidth(MAX_WIDTH, "ArrowRight", true)).toBe(MAX_WIDTH);
  });

  it("ignores every other key, so typing elsewhere is not swallowed", () => {
    for (const key of ["Tab", "Enter", "a", "ArrowUp", "ArrowDown", "Escape"]) {
      expect(keyboardWidth(300, key, false), key).toBeNull();
    }
  });
});
