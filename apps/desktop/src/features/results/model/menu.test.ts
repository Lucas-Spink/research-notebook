import { describe, expect, it } from "vitest";
import { pickedAction, rowMenu } from "./menu";
import { ids, sampleArtefacts } from "./sample";
import { treeRows, type TreeRow } from "./tree";

const file = sampleArtefacts();
const rows = treeRows(file, {});
const row = (index: number): TreeRow => {
  const found = rows[index];
  if (found === undefined) throw new Error("sample");
  return found;
};
const labels = (r: TreeRow) => rowMenu(file, r).map((entry) => entry.label);

describe("rowMenu", () => {
  it("offers Move to and Add to as separate actions for an item (FR-GRP-02)", () => {
    expect(labels(row(3))).toEqual(["moveTo", "addTo", "moveDown", "remove"]);
    expect(labels(row(4))).toEqual(["moveTo", "addTo", "moveUp", "remove"]);
    expect(labels(row(8))).toEqual(["moveTo", "addTo"]);
  });

  it("only offers groups that do not already hold the artefact", () => {
    const moveTo = rowMenu(file, row(4))[0];
    expect(moveTo?.run).toEqual({
      kind: "pick",
      mode: "moveTo",
      targets: [{ id: ids.g(2), name: "Tables", depth: 1 }],
    });
  });

  it("offers group management for a group", () => {
    expect(labels(row(0))).toEqual([
      "newSubgroup",
      "rename",
      "moveDown",
      "moveInto",
      "delete",
    ]);
    expect(labels(row(1))).toEqual([
      "newSubgroup",
      "rename",
      "moveToTop",
      "moveInto",
      "delete",
    ]);
  });

  it("never offers a group as a place to put itself or its parent", () => {
    const into = rowMenu(file, row(1)).find((e) => e.label === "moveInto");
    expect(into?.run).toEqual({
      kind: "pick",
      mode: "moveInto",
      targets: [{ id: ids.g(2), name: "Tables", depth: 1 }],
    });
    const figuresInto = rowMenu(file, row(0)).find(
      (e) => e.label === "moveInto",
    );
    expect(figuresInto?.run).toEqual({
      kind: "pick",
      mode: "moveInto",
      targets: [{ id: ids.g(2), name: "Tables", depth: 1 }],
    });
  });

  it("has nothing for the Ungrouped area", () => {
    expect(labels(row(7))).toEqual([]);
  });
});

describe("pickedAction", () => {
  it("builds the action for the chosen target", () => {
    expect(pickedAction(row(3), "moveTo", ids.g(2))).toEqual({
      kind: "moveToGroup",
      artefactId: ids.r(1),
      from: ids.g(1),
      to: ids.g(2),
    });
    expect(pickedAction(row(8), "addTo", ids.g(2))).toEqual({
      kind: "addToGroup",
      artefactId: ids.r(4),
      groupId: ids.g(2),
    });
    expect(pickedAction(row(1), "moveInto", ids.g(2))).toEqual({
      kind: "moveGroup",
      groupId: ids.g(3),
      parent: ids.g(2),
    });
    expect(pickedAction(row(0), "addTo", ids.g(2))).toBeNull();
  });
});
