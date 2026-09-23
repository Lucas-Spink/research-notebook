import { describe, expect, it } from "vitest";
import {
  deletionSummary,
  groupTargets,
  hasChildren,
  positions,
  treeRows,
} from "./tree";
import { ids, largeArtefacts, sampleArtefacts } from "./sample";

const shape = (rows: ReturnType<typeof treeRows>) =>
  rows.map((row) => `${row.depth}:${row.kind}:${row.key}`);

describe("treeRows", () => {
  it("lists subgroups before items, then the Ungrouped area, never methods", () => {
    expect(shape(treeRows(sampleArtefacts(), {}))).toEqual([
      `1:group:g:${ids.g(1)}`,
      `2:group:g:${ids.g(3)}`,
      `3:item:i:${ids.g(3)}:${ids.r(2)}`,
      `2:item:i:${ids.g(1)}:${ids.r(1)}`,
      `2:item:i:${ids.g(1)}:${ids.r(2)}`,
      `1:group:g:${ids.g(2)}`,
      `2:item:i:${ids.g(2)}:${ids.r(3)}`,
      "1:ungrouped:ungrouped",
      `2:item:i:ungrouped:${ids.r(4)}`,
    ]);
  });

  it("gives positions, counts and parents", () => {
    const rows = treeRows(sampleArtefacts(), {});
    expect(rows[0]).toMatchObject({
      kind: "group",
      name: "Figures",
      parent: null,
      parentKey: null,
      index: 0,
      siblings: 2,
      itemCount: 2,
      groupCount: 1,
      expanded: true,
    });
    expect(rows[3]).toMatchObject({
      kind: "item",
      name: "Volcano plot",
      group: ids.g(1),
      parentKey: `g:${ids.g(1)}`,
      index: 0,
      siblings: 2,
    });
    expect(rows[7]).toMatchObject({ kind: "ungrouped", itemCount: 1 });
  });

  it("hides the contents of a collapsed group", () => {
    const rows = treeRows(sampleArtefacts(), { [`g:${ids.g(1)}`]: false });
    expect(rows.map((r) => r.key).slice(0, 2)).toEqual([
      `g:${ids.g(1)}`,
      `g:${ids.g(2)}`,
    ]);
  });

  it("collapses groups with more than 50 items by default (FR-GRP-06)", () => {
    const at50 = treeRows(largeArtefacts(50, 1), {});
    expect(at50[0]).toMatchObject({ itemCount: 50, expanded: true });
    expect(at50).toHaveLength(52);

    const at51 = treeRows(largeArtefacts(51, 1), {});
    expect(at51[0]).toMatchObject({ itemCount: 51, expanded: false });
    expect(at51).toHaveLength(2);

    const opened = treeRows(largeArtefacts(51, 1), { [`g:${ids.g(1)}`]: true });
    expect(opened).toHaveLength(53);
  });

  it("collapses a large Ungrouped area too", () => {
    const file = { ...largeArtefacts(60, 1), groups: [] };
    expect(treeRows(file, {})).toEqual([
      expect.objectContaining({
        kind: "ungrouped",
        itemCount: 60,
        expanded: false,
      }),
    ]);
  });
});

describe("groupTargets and deletionSummary", () => {
  it("lists every group in tree order with its depth", () => {
    expect(groupTargets(sampleArtefacts())).toEqual([
      { id: ids.g(1), name: "Figures", depth: 1 },
      { id: ids.g(3), name: "Supplementary", depth: 2 },
      { id: ids.g(2), name: "Tables", depth: 1 },
    ]);
  });

  it("counts the groups inside and the memberships a delete removes", () => {
    expect(deletionSummary(sampleArtefacts(), ids.g(1))).toEqual({
      groups: 1,
      memberships: 3,
    });
    expect(deletionSummary(sampleArtefacts(), ids.g(2))).toEqual({
      groups: 0,
      memberships: 1,
    });
  });
});

describe("positions and hasChildren", () => {
  it("counts subgroups and items together as siblings", () => {
    const rows = treeRows(sampleArtefacts(), {});
    const at = positions(rows);
    expect(at.get(`g:${ids.g(1)}`)).toEqual({ position: 1, setSize: 3 });
    expect(at.get(`g:${ids.g(3)}`)).toEqual({ position: 1, setSize: 3 });
    expect(at.get(`i:${ids.g(1)}:${ids.r(2)}`)).toEqual({
      position: 3,
      setSize: 3,
    });
    expect(at.get("ungrouped")).toEqual({ position: 3, setSize: 3 });
  });

  it("treats an empty group and an empty Ungrouped area as leaves", () => {
    const file = { ...sampleArtefacts(), artefacts: [], groups: [] };
    const empty = treeRows(
      {
        ...file,
        groups: [{ id: ids.g(5), name: "Empty", items: [], groups: [] }],
      },
      {},
    );
    expect(empty.map(hasChildren)).toEqual([false, false]);
  });
});
