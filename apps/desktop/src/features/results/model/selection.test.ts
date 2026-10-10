import { describe, expect, it } from "vitest";
import { applyGroupAction } from "./actions";
import { dropAction, draggedFrom } from "./drag";
import { rowMenu } from "./menu";
import {
  batchAction,
  batchRemove,
  ranged,
  selectedRows,
  toggled,
} from "./selection";
import { ids, sampleArtefacts } from "./sample";
import { treeRows } from "./tree";

const env = {
  now: () => new Date("2026-09-23T10:00:00Z"),
  newId: () => ids.g(9),
  appVersion: "0.0.0",
};
const file = sampleArtefacts();
const rows = treeRows(file, {});
const itemRows = rows.filter((r) => r.kind === "item");
const key = (index: number) => itemRows[index]?.key ?? "";

describe("selection", () => {
  it("toggles a key in and out without changing the original", () => {
    const empty = new Set<string>();
    const one = toggled(empty, "a");
    expect([...one]).toEqual(["a"]);
    expect(empty.size).toBe(0);
    expect(toggled(one, "a").size).toBe(0);
  });

  it("chooses every artefact between two, passing over folders", () => {
    const from = rows.findIndex((r) => r.kind === "item");
    const last =
      rows.length - 1 - [...rows].reverse().findIndex((r) => r.kind === "item");
    const chosen = ranged(
      rows,
      new Set(),
      rows[from]?.key ?? null,
      rows[last]?.key ?? "",
    );
    expect(chosen.size).toBe(itemRows.length);
    expect([...chosen].every((k) => k.startsWith("i:"))).toBe(true);
  });

  it("chooses just the clicked one when the anchor is not on screen", () => {
    expect([...ranged(rows, new Set(), "gone", key(0))]).toEqual([key(0)]);
  });

  it("drops chosen rows that are no longer shown", () => {
    const chosen = selectedRows(rows, new Set([key(0), "i:gone:x"]));
    expect(chosen.map((r) => r.key)).toEqual([key(0)]);
  });
});

describe("batch actions", () => {
  const first = selectedRows(rows, new Set([key(0), key(1)]));

  it("moves every chosen artefact to a group in one change, and skips those already there", () => {
    const action = batchAction(file, first, "moveTo", ids.g(2));
    expect(action?.kind).toBe("batch");
    const moved = action && applyGroupAction(file, action, env);
    const tables = moved?.ok
      ? moved.value.groups.find((g) => g.id === ids.g(2))?.items
      : undefined;
    expect(tables).toEqual(
      expect.arrayContaining(first.map((r) => r.artefactId)),
    );
    // Held already: nothing to do for that artefact.
    const held = selectedRows(rows, new Set([key(0)]));
    const target = rows.find((r) => r.kind === "item" && r.key === key(0));
    if (target?.kind !== "item" || target.group === null)
      throw new Error("sample");
    expect(batchAction(file, held, "moveTo", target.group)).toBeNull();
  });

  it("keeps every other memberships when adding", () => {
    const action = batchAction(file, first, "addTo", ids.g(2));
    const added = action && applyGroupAction(file, action, env);
    expect(added?.ok && added.value.groups[0]?.items).toEqual(
      file.groups[0]?.items,
    );
  });

  it("is all or nothing: one refused step keeps none", () => {
    const result = applyGroupAction(
      file,
      {
        kind: "batch",
        actions: [
          { kind: "addToGroup", artefactId: ids.r(4), groupId: ids.g(2) },
          { kind: "addToGroup", artefactId: ids.r(4), groupId: "missing" },
        ],
      },
      env,
    );
    expect(result.ok).toBe(false);
  });

  it("removes every chosen artefact from the group it is shown in", () => {
    const action = batchRemove(first);
    expect(action?.kind).toBe("batch");
    expect(batchRemove([])).toBeNull();
  });
});

describe("dragging several", () => {
  it("drops them on a group as one batch, and refuses a place among items", () => {
    const items = selectedRows(rows, new Set([key(0), key(1)]))
      .map((r) => draggedFrom(r))
      .flatMap((d) => (d?.kind === "item" ? [d] : []));
    const group = rows.find((r) => r.kind === "group" && r.id === ids.g(2));
    if (group === undefined) throw new Error("sample");
    const action = dropAction({ kind: "items", items }, group, false);
    expect(action?.kind).toBe("batch");
    const item = rows.find((r) => r.kind === "item");
    if (item === undefined) throw new Error("sample");
    expect(dropAction({ kind: "items", items }, item, false)).toBeNull();
  });
});

describe("rowMenu with several chosen", () => {
  it("offers Move to, Add to and Remove for all of them, and no single-item entries", () => {
    const chosen = selectedRows(rows, new Set([key(0), key(1)]));
    const row = chosen[0];
    if (row === undefined) throw new Error("sample");
    expect(
      rowMenu(file, row, { selected: chosen }).map((e) => e.label),
    ).toEqual(["moveTo", "addTo", "remove"]);
  });
});
