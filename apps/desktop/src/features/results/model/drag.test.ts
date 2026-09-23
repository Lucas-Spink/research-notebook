import { describe, expect, it } from "vitest";
import { dropAction, type Dragged } from "./drag";
import { ids, sampleArtefacts } from "./sample";
import { treeRows, type TreeRow } from "./tree";

const rows = treeRows(sampleArtefacts(), {});
const row = (index: number): TreeRow => {
  const found = rows[index];
  if (found === undefined) throw new Error("sample");
  return found;
};
// 0 Figures, 1 Supplementary, 2 R2 in Supp., 3 R1 in Figures, 4 R2 in Figures,
// 5 Tables, 6 R3 in Tables, 7 Ungrouped, 8 R4 ungrouped.

const r1FromFigures: Dragged = {
  kind: "item",
  artefactId: ids.r(1),
  from: ids.g(1),
  index: 0,
};
const r4Ungrouped: Dragged = {
  kind: "item",
  artefactId: ids.r(4),
  from: null,
  index: 0,
};
const figures: Dragged = { kind: "group", groupId: ids.g(1) };
const tables: Dragged = { kind: "group", groupId: ids.g(2) };

describe("dropAction", () => {
  it("drops an item on a group: Move by default, Add with the copy key", () => {
    expect(dropAction(r1FromFigures, row(5), false)).toEqual({
      kind: "moveToGroup",
      artefactId: ids.r(1),
      from: ids.g(1),
      to: ids.g(2),
    });
    expect(dropAction(r1FromFigures, row(5), true)).toEqual({
      kind: "addToGroup",
      artefactId: ids.r(1),
      groupId: ids.g(2),
    });
    expect(dropAction(r4Ungrouped, row(5), false)).toEqual({
      kind: "moveToGroup",
      artefactId: ids.r(4),
      from: null,
      to: ids.g(2),
    });
  });

  it("drops an item on an item: placed before it", () => {
    expect(dropAction(r4Ungrouped, row(6), true)).toEqual({
      kind: "addToGroup",
      artefactId: ids.r(4),
      groupId: ids.g(2),
      index: 0,
    });
  });

  it("reorders within one group, allowing for the item leaving its place", () => {
    const r2: Dragged = {
      kind: "item",
      artefactId: ids.r(2),
      from: ids.g(1),
      index: 1,
    };
    expect(dropAction(r2, row(3), false)).toEqual({
      kind: "moveToGroup",
      artefactId: ids.r(2),
      from: ids.g(1),
      to: ids.g(1),
      index: 0,
    });
    expect(dropAction(r1FromFigures, row(4), false)).toBeNull();
    expect(dropAction(r1FromFigures, row(0), false)).toBeNull();
  });

  it("drops an item on the Ungrouped area: removes it from its source group", () => {
    expect(dropAction(r1FromFigures, row(7), false)).toEqual({
      kind: "removeFromGroup",
      artefactId: ids.r(1),
      groupId: ids.g(1),
    });
    expect(dropAction(r1FromFigures, row(8), false)).toEqual({
      kind: "removeFromGroup",
      artefactId: ids.r(1),
      groupId: ids.g(1),
    });
    expect(dropAction(r1FromFigures, row(7), true)).toBeNull();
    expect(dropAction(r4Ungrouped, row(7), false)).toBeNull();
  });

  it("drops a group on a group: nested at its end", () => {
    expect(dropAction(tables, row(0), false)).toEqual({
      kind: "moveGroup",
      groupId: ids.g(2),
      parent: ids.g(1),
    });
    expect(dropAction(figures, row(0), false)).toBeNull();
    expect(dropAction(figures, row(3), false)).toBeNull();
    expect(dropAction(figures, row(7), false)).toBeNull();
  });
});
