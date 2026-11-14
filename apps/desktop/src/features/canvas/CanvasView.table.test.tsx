import { parseCanvas, serialiseCanvas } from "@research-notebook/format";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CanvasView } from "./CanvasView";
import { A, FOLDER, fakeApi, pathOf, textOf } from "./model/fakeApi";
import { newCanvasFile } from "./model/canvasFiles";
import type { CanvasApi } from "./model/store";
import { applyTableChange, addTable, tableNodes } from "./model/tables";
import {
  buttonNamed,
  click,
  fakeCards,
  flush,
  foundResult,
  mount,
  stubFlowEnvironment,
  type as typeInto,
  unmount,
} from "./testSupport";
import { useCanvases, type CanvasesModel } from "./useCanvases";

/**
 * ADR-0071: a table of figures on the canvas. It is added from the bar, has
 * headings that are edited in place, rows and columns that come and go, and
 * takes a result dropped on one of its cells. Only the canvas file changes.
 */

beforeAll(stubFlowEnvironment);
afterEach(unmount);

const EXP = "01JAXE000000000000000000A1";
const ART = "01JAXA000000000000000000A1";
const ART_2 = "01JAXA000000000000000000A2";
const ART_3 = "01JAXA000000000000000000A3";
const QUESTION = { id: A, name: "Q-001 First" };
const TABS = [{ key: "Q-001.md", label: "Q-001 First" }];

let model: CanvasesModel | null = null;

function Harness({
  api,
  cards,
  writable = true,
}: {
  api: CanvasApi;
  cards: ReturnType<typeof fakeCards>;
  writable?: boolean;
}) {
  const canvases = useCanvases({
    api,
    folder: FOLDER,
    writable,
    enabled: true,
    question: QUESTION,
    saveDelayMs: 0,
  });
  model = canvases;
  return (
    <CanvasView
      canvases={canvases}
      cards={cards}
      questions={TABS}
      question={TABS[0]?.key ?? null}
      onChooseQuestion={() => undefined}
    />
  );
}

let counter = 0;
const newId = () => `01JAXT${String(++counter).padStart(20, "0")}`;

/** A canvas holding one table of two rows and two columns, with `fill` applied to it. */
function tableCanvas(
  fill: (
    file: ReturnType<typeof newCanvasFile>,
    table: ReturnType<typeof tableNodes>[number],
  ) => ReturnType<typeof newCanvasFile> = (file) => file,
) {
  const base = addTable(
    newCanvasFile(A, "Compare"),
    { x: 500, y: 400 },
    newId,
    { rows: ["Replicate 1", "Replicate 2"], columns: ["Control", "Treated"] },
  );
  const [table] = tableNodes(base);
  if (table === undefined) throw new Error("no table");
  const file = fill(base, table);
  return { text: serialiseCanvas(file), table, file };
}

const refOf = (artefactId: string, version?: number) => ({
  experimentId: EXP,
  artefactId,
  ...(version === undefined ? {} : { version }),
});

async function open(
  files: Record<string, string>,
  answers: Parameters<typeof fakeCards>[0] = {},
  writable = true,
) {
  const fake = fakeApi(files);
  const cards = fakeCards(answers);
  const view = mount(
    <Harness api={fake.api} cards={cards} writable={writable} />,
  );
  await flush();
  return { view, cards, ...fake };
}

const saved = (disk: Record<string, string>) => {
  const parsed = parseCanvas(disk[pathOf(A)] ?? "");
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
};

const savedTable = (disk: Record<string, string>) => {
  const [table] = tableNodes(saved(disk));
  if (table === undefined) throw new Error("no table saved");
  return table;
};

const cellAt = (view: HTMLElement, row: string, column: string) => {
  const found = view.querySelector<HTMLElement>(
    `[data-table-cell][data-row="${row}"][data-column="${column}"]`,
  );
  if (found === null) throw new Error("no such cell");
  return found;
};

const heading = (view: HTMLElement, label: string) => {
  const found = [
    ...view.querySelectorAll<HTMLInputElement>(".canvas-table__heading"),
  ].find((input) => input.value === label);
  if (found === undefined) throw new Error(`no heading ${label}`);
  return found;
};

describe("adding a table", () => {
  it("adds one of two rows and two columns from the bar, and saves the canvas as version 3", async () => {
    const { view, disk } = await open({ [pathOf(A)]: textOf(A, "Compare") });
    expect(view.querySelector(".canvas-table")).toBeNull();
    click(buttonNamed(view, "Add table"));
    await flush();
    expect(view.querySelector(".canvas-table")).not.toBeNull();
    const file = saved(disk);
    expect(file.format_version).toBe(3);
    const table = savedTable(disk);
    expect(table.rows.map((r) => r.label)).toEqual(["Row 1", "Row 2"]);
    expect(table.columns.map((c) => c.label)).toEqual(["Column 1", "Column 2"]);
    expect(Object.keys(disk)).toEqual([pathOf(A)]);
  });

  it("cannot be added when the project is read-only", async () => {
    const { view } = await open(
      { [pathOf(A)]: textOf(A, "Compare") },
      {},
      false,
    );
    expect(buttonNamed(view, "Add table").disabled).toBe(true);
  });
});

describe("a table on the canvas", () => {
  it("shows its headings, and an empty cell says where to drop a result", async () => {
    const { text } = tableCanvas();
    const { view } = await open({ [pathOf(A)]: text });
    expect(heading(view, "Replicate 1")).toBeDefined();
    expect(heading(view, "Treated")).toBeDefined();
    expect(view.querySelectorAll("[data-table-cell]")).toHaveLength(4);
    expect(view.textContent).toContain("Drop a result here");
  });

  it("adds a row at the bottom and a column at the right", async () => {
    const { text } = tableCanvas();
    const { view, disk } = await open({ [pathOf(A)]: text });
    click(buttonNamed(view, "Add row"));
    await flush();
    click(buttonNamed(view, "Add column"));
    await flush();
    const table = savedTable(disk);
    expect(table.rows.map((r) => r.label)).toEqual([
      "Replicate 1",
      "Replicate 2",
      "Row 3",
    ]);
    expect(table.columns.map((c) => c.label)).toEqual([
      "Control",
      "Treated",
      "Column 3",
    ]);
    expect(view.querySelectorAll("[data-table-cell]")).toHaveLength(9);
  });

  it("renames a heading when the person leaves it, keeping the figures under it", async () => {
    const { text, table } = tableCanvas((file, t) => {
      const [r1] = t.rows;
      const [c1] = t.columns;
      if (!r1 || !c1) throw new Error("fixture");
      return applyTableChange(file, t.id, {
        kind: "setCell",
        row: r1.id,
        column: c1.id,
        ref: refOf(ART),
      });
    });
    const { view, disk } = await open(
      { [pathOf(A)]: text },
      { [ART]: foundResult() },
    );
    const input = heading(view, "Control");
    typeInto(input, "Vehicle");
    act(() => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await flush();
    const after = savedTable(disk);
    expect(after.columns[0]?.label).toBe("Vehicle");
    expect(after.cells).toHaveLength(1);
    expect(after.columns[0]?.id).toBe(table.columns[0]?.id);
  });

  it("puts a heading back when it is left empty", async () => {
    const { text } = tableCanvas();
    const { view, disk } = await open({ [pathOf(A)]: text });
    const before = disk[pathOf(A)];
    const input = heading(view, "Treated");
    typeInto(input, "   ");
    act(() => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await flush();
    expect(heading(view, "Treated")).toBeDefined();
    expect(disk[pathOf(A)]).toBe(before);
  });

  it("removes a row together with its figures", async () => {
    const { text, table } = tableCanvas((file, t) => {
      const [r1, r2] = t.rows;
      const [c1] = t.columns;
      if (!r1 || !r2 || !c1) throw new Error("fixture");
      const one = applyTableChange(file, t.id, {
        kind: "setCell",
        row: r1.id,
        column: c1.id,
        ref: refOf(ART),
      });
      return applyTableChange(one, t.id, {
        kind: "setCell",
        row: r2.id,
        column: c1.id,
        ref: refOf(ART_2),
      });
    });
    const { view, disk } = await open(
      { [pathOf(A)]: text },
      { [ART]: foundResult(), [ART_2]: foundResult({ name: "Other" }) },
    );
    click(view.querySelector('button[aria-label="Remove row Replicate 1"]'));
    await flush();
    const after = savedTable(disk);
    expect(after.rows.map((r) => r.id)).toEqual([table.rows[1]?.id]);
    expect(after.cells.map((c) => c.artefact_id)).toEqual([ART_2]);
  });

  it("removes a column", async () => {
    const { text } = tableCanvas();
    const { view, disk } = await open({ [pathOf(A)]: text });
    click(view.querySelector('button[aria-label="Remove column Control"]'));
    await flush();
    expect(savedTable(disk).columns.map((c) => c.label)).toEqual(["Treated"]);
  });

  it("switches what sets the shape of the cells", async () => {
    const { text } = tableCanvas();
    const { view, disk } = await open({ [pathOf(A)]: text });
    const select = view.querySelector<HTMLSelectElement>(
      ".canvas-table__fit select",
    );
    if (select === null) throw new Error("no select");
    act(() => {
      select.value = "column";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(savedTable(disk).fit).toBe("column");
  });

  it("removes the whole table at once when it is empty, and asks first when it holds figures", async () => {
    const empty = await open({ [pathOf(A)]: tableCanvas().text });
    click(
      empty.view.querySelector(
        'button[aria-label="Remove the table from the canvas"]',
      ),
    );
    await flush();
    expect(empty.view.querySelector(".canvas-table")).toBeNull();
    unmount();

    const { text } = tableCanvas((file, t) => {
      const [r1] = t.rows;
      const [c1] = t.columns;
      if (!r1 || !c1) throw new Error("fixture");
      return applyTableChange(file, t.id, {
        kind: "setCell",
        row: r1.id,
        column: c1.id,
        ref: refOf(ART),
      });
    });
    const full = await open({ [pathOf(A)]: text }, { [ART]: foundResult() });
    click(
      full.view.querySelector(
        'button[aria-label="Remove the table from the canvas"]',
      ),
    );
    expect(full.view.querySelector(".canvas-table")).not.toBeNull();
    click(buttonNamed(full.view, "Keep"));
    expect(full.view.querySelector(".canvas-table")).not.toBeNull();
    click(
      full.view.querySelector(
        'button[aria-label="Remove the table from the canvas"]',
      ),
    );
    click(buttonNamed(full.view, "Remove table and its figures"));
    await flush();
    expect(full.view.querySelector(".canvas-table")).toBeNull();
    expect(tableNodes(saved(full.disk))).toEqual([]);
  });

  it("offers no editing where the canvas cannot be changed", async () => {
    const { text } = tableCanvas();
    const { view } = await open({ [pathOf(A)]: text }, {}, false);
    expect(
      [...view.querySelectorAll("button")].map((b) => b.textContent),
    ).not.toContain("Add row");
    expect(heading(view, "Control").readOnly).toBe(true);
    expect(
      view.querySelector('button[aria-label="Remove row Replicate 1"]'),
    ).toBeNull();
  });
});

describe("figures in cells", () => {
  const dropOn = (cell: HTMLElement, refs: ReturnType<typeof refOf>[]) => {
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => cell,
    });
    let pinned = false;
    act(() => {
      pinned = model?.pinAt(refs, { x: 400, y: 300 }) ?? false;
    });
    Reflect.deleteProperty(document, "elementFromPoint");
    return pinned;
  };

  it("fills the cell a result is dropped on, and makes no card", async () => {
    const { text, table } = tableCanvas();
    const { view, disk } = await open(
      { [pathOf(A)]: text },
      { [ART]: foundResult() },
    );
    const [r1] = table.rows;
    const [, c2] = table.columns;
    if (!r1 || !c2) throw new Error("fixture");
    expect(dropOn(cellAt(view, r1.id, c2.id), [refOf(ART, 2)])).toBe(true);
    await flush();
    const after = savedTable(disk);
    expect(after.cells).toEqual([
      expect.objectContaining({
        row: r1.id,
        column: c2.id,
        artefact_id: ART,
        version: 2,
      }),
    ]);
    expect(saved(disk).nodes.filter((n) => n.type === "artefact")).toEqual([]);
    expect(cellAt(view, r1.id, c2.id).textContent).toContain(
      "picture of PCA plot",
    );
  });

  it("fills the next empty cells with the rest of several results", async () => {
    const { text, table } = tableCanvas();
    const { view, disk } = await open(
      { [pathOf(A)]: text },
      {
        [ART]: foundResult(),
        [ART_2]: foundResult({ name: "Two" }),
        [ART_3]: foundResult({ name: "Three" }),
      },
    );
    const [r1, r2] = table.rows;
    const [c1, c2] = table.columns;
    if (!r1 || !r2 || !c1 || !c2) throw new Error("fixture");
    dropOn(cellAt(view, r1.id, c2.id), [
      refOf(ART),
      refOf(ART_2),
      refOf(ART_3),
    ]);
    await flush();
    const at = (r: string, c: string) =>
      savedTable(disk).cells.find((x) => x.row === r && x.column === c)
        ?.artefact_id;
    expect(at(r1.id, c2.id)).toBe(ART);
    expect(at(r2.id, c1.id)).toBe(ART_2);
    expect(at(r2.id, c2.id)).toBe(ART_3);
  });

  it("says so when there is no room for all of them, and places those that fit", async () => {
    const { text, table } = tableCanvas();
    const { view, disk } = await open(
      { [pathOf(A)]: text },
      { [ART]: foundResult(), [ART_2]: foundResult(), [ART_3]: foundResult() },
    );
    const [, r2] = table.rows;
    const [, c2] = table.columns;
    if (!r2 || !c2) throw new Error("fixture");
    dropOn(cellAt(view, r2.id, c2.id), [
      refOf(ART),
      refOf(ART_2),
      refOf(ART_3),
    ]);
    await flush();
    expect(savedTable(disk).cells).toHaveLength(1);
    expect(view.textContent).toContain("no empty cells left");
  });

  it("empties a cell without touching the result", async () => {
    const { text } = tableCanvas((file, t) => {
      const [r1] = t.rows;
      const [c1] = t.columns;
      if (!r1 || !c1) throw new Error("fixture");
      return applyTableChange(file, t.id, {
        kind: "setCell",
        row: r1.id,
        column: c1.id,
        ref: refOf(ART),
      });
    });
    const { view, disk } = await open(
      { [pathOf(A)]: text },
      { [ART]: foundResult() },
    );
    click(view.querySelector('button[aria-label="Remove from the table"]'));
    await flush();
    expect(savedTable(disk).cells).toEqual([]);
    expect(Object.keys(disk)).toEqual([pathOf(A)]);
  });

  it("shows a cell whose result is gone as unavailable, and lets it be emptied", async () => {
    const { text } = tableCanvas((file, t) => {
      const [r1] = t.rows;
      const [c1] = t.columns;
      if (!r1 || !c1) throw new Error("fixture");
      return applyTableChange(file, t.id, {
        kind: "setCell",
        row: r1.id,
        column: c1.id,
        ref: refOf(ART),
      });
    });
    const { view, disk } = await open({ [pathOf(A)]: text }, {});
    expect(view.textContent).toContain("Result not available");
    expect(savedTable(disk).cells).toHaveLength(1);
    click(buttonNamed(view, "Remove from the table"));
    await flush();
    expect(savedTable(disk).cells).toEqual([]);
  });

  it("opens the original from a cell", async () => {
    const { text } = tableCanvas((file, t) => {
      const [r1] = t.rows;
      const [c1] = t.columns;
      if (!r1 || !c1) throw new Error("fixture");
      return applyTableChange(file, t.id, {
        kind: "setCell",
        row: r1.id,
        column: c1.id,
        ref: refOf(ART),
      });
    });
    const { view, cards } = await open(
      { [pathOf(A)]: text },
      { [ART]: foundResult() },
    );
    click(view.querySelector('button[aria-label="Open PCA plot"]'));
    expect(cards.opened).toEqual([[ART, 1]]);
  });
});
