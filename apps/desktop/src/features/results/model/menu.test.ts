import { describe, expect, it } from "vitest";
import { applyGroupAction } from "./actions";
import { pickedAction, rowMenu } from "./menu";
import { ids, sampleArtefacts } from "./sample";
import { treeRows, type TreeRow } from "./tree";

const file = sampleArtefacts();
const testEnv = {
  now: () => new Date("2026-09-23T10:00:00Z"),
  newId: () => ids.g(9),
  appVersion: "0.0.0",
};
const rows = treeRows(file, {});
const row = (index: number): TreeRow => {
  const found = rows[index];
  if (found === undefined) throw new Error("sample");
  return found;
};
const labels = (r: TreeRow) => rowMenu(file, r).map((entry) => entry.label);

describe("rowMenu", () => {
  it("offers Preview first for an artefact when previews can be opened (ADR-0044)", () => {
    const item = row(3);
    if (item.kind !== "item") throw new Error("sample");
    const menu = rowMenu(file, item, { canOpen: true });
    expect(menu.map((entry) => entry.label)).toEqual([
      "preview",
      "moveTo",
      "addTo",
      "markMainFigure",
      "classify",
      "moveDown",
      "remove",
    ]);
    expect(menu[0]?.run).toEqual({ kind: "open", artefactId: item.artefactId });
  });

  it("offers no Preview for a group, or when previews cannot be opened", () => {
    expect(labels(row(3))).not.toContain("preview");
    expect(
      rowMenu(file, row(0), { canOpen: true }).map((entry) => entry.label),
    ).not.toContain("preview");
  });

  it("offers Move to and Add to as separate actions for an item (FR-GRP-02)", () => {
    const classify = ["markMainFigure", "classify"];
    expect(labels(row(3))).toEqual([
      "moveTo",
      "addTo",
      ...classify,
      "moveDown",
      "remove",
    ]);
    expect(labels(row(4))).toEqual([
      "moveTo",
      "addTo",
      ...classify,
      "moveUp",
      "remove",
    ]);
    expect(labels(row(8))).toEqual(["moveTo", "addTo", ...classify]);
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

describe("classification entries (ADR-0059)", () => {
  const withClass = (value: string) => {
    const classified = sampleArtefacts();
    const target = classified.artefacts.find((a) => a.id === ids.r(1));
    if (target === undefined) throw new Error("sample");
    target.classification = value;
    const item = treeRows(classified, {}).find(
      (r) => r.kind === "item" && r.artefactId === ids.r(1),
    );
    if (item === undefined) throw new Error("sample");
    return { classified, item };
  };

  it("marks an unclassified result as a main figure, and offers the other classifications", () => {
    const item = row(3);
    const menu = rowMenu(file, item);
    expect(menu.find((e) => e.label === "markMainFigure")?.run).toEqual({
      kind: "action",
      action: {
        kind: "setClassification",
        artefactId: ids.r(1),
        classification: "main_figure",
      },
    });
    const classify = menu.find((e) => e.label === "classify");
    expect(
      classify?.run.kind === "pick" && classify.run.targets.map((t) => t.id),
    ).toEqual([
      "main_figure",
      "supplementary_figure",
      "intermediate_output",
      "quality_control",
      "general",
    ]);
  });

  it("unmarks a main figure, and offers Clear for any other classification", () => {
    const main = withClass("main_figure");
    const mainLabels = rowMenu(main.classified, main.item).map((e) => e.label);
    expect(mainLabels).toContain("unmarkMainFigure");
    expect(mainLabels).not.toContain("clearClassification");
    const qc = withClass("quality_control");
    const qcLabels = rowMenu(qc.classified, qc.item).map((e) => e.label);
    expect(qcLabels).toContain("markMainFigure");
    expect(qcLabels).toContain("clearClassification");
  });

  it("builds the picked classification as an action, and none for a group", () => {
    expect(pickedAction(row(3), "classify", "quality_control")).toEqual({
      kind: "setClassification",
      artefactId: ids.r(1),
      classification: "quality_control",
    });
    expect(pickedAction(row(0), "classify", "general")).toBeNull();
  });

  it("keeps the classification when the result is moved between groups", () => {
    const { classified, item } = withClass("main_figure");
    if (item.kind !== "item") throw new Error("sample");
    const moved = applyGroupAction(
      classified,
      { kind: "addToGroup", artefactId: ids.r(1), groupId: ids.g(2) },
      testEnv,
    );
    expect(moved.ok && moved.value.artefacts[0]?.classification).toBe(
      "main_figure",
    );
  });
});
