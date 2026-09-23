import { describe, expect, it } from "vitest";
import { navigate, rowCommand } from "./keys";
import { ids, sampleArtefacts } from "./sample";
import { treeRows, type TreeRow } from "./tree";

const rows = treeRows(sampleArtefacts(), {});
const key = (index: number): string => {
  const row = rows[index];
  if (row === undefined) throw new Error("sample");
  return row.key;
};
const row = (index: number): TreeRow => {
  const found = rows[index];
  if (found === undefined) throw new Error("sample");
  return found;
};
const press = (
  k: string,
  mods: { altKey?: boolean; shiftKey?: boolean } = {},
) => ({
  key: k,
  altKey: mods.altKey ?? false,
  shiftKey: mods.shiftKey ?? false,
});

describe("navigate (ARIA treeview keys)", () => {
  it("moves down and up, stopping at the ends", () => {
    expect(navigate(rows, key(0), "ArrowDown")).toEqual({ focus: key(1) });
    expect(navigate(rows, key(1), "ArrowUp")).toEqual({ focus: key(0) });
    expect(navigate(rows, key(0), "ArrowUp")).toBeNull();
    expect(navigate(rows, key(8), "ArrowDown")).toBeNull();
  });

  it("jumps to the first and last rows", () => {
    expect(navigate(rows, key(4), "Home")).toEqual({ focus: key(0) });
    expect(navigate(rows, key(0), "End")).toEqual({ focus: key(8) });
  });

  it("Right expands a collapsed group, then enters it", () => {
    const collapsed = treeRows(sampleArtefacts(), { [key(0)]: false });
    expect(navigate(collapsed, key(0), "ArrowRight")).toEqual({
      expand: key(0),
      expanded: true,
    });
    expect(navigate(rows, key(0), "ArrowRight")).toEqual({ focus: key(1) });
    expect(navigate(rows, key(3), "ArrowRight")).toBeNull();
  });

  it("Left collapses an open group, otherwise goes to the parent", () => {
    expect(navigate(rows, key(0), "ArrowLeft")).toEqual({
      expand: key(0),
      expanded: false,
    });
    expect(navigate(rows, key(3), "ArrowLeft")).toEqual({ focus: key(0) });
    expect(navigate(rows, key(8), "ArrowLeft")).toEqual({ focus: key(7) });
  });

  it("starts at the first row when nothing is focused", () => {
    expect(navigate(rows, null, "ArrowDown")).toEqual({ focus: key(0) });
  });
});

describe("rowCommand", () => {
  it("opens the actions with Enter, Shift+F10 or the context menu key", () => {
    expect(rowCommand(row(3), press("Enter"))).toEqual({ kind: "menu" });
    expect(rowCommand(row(3), press("F10", { shiftKey: true }))).toEqual({
      kind: "menu",
    });
    expect(rowCommand(row(3), press("ContextMenu"))).toEqual({ kind: "menu" });
    expect(rowCommand(row(3), press("F10"))).toBeNull();
  });

  it("reorders items and groups with Alt+Up and Alt+Down", () => {
    expect(rowCommand(row(4), press("ArrowUp", { altKey: true }))).toEqual({
      kind: "action",
      action: {
        kind: "reorderItem",
        groupId: ids.g(1),
        artefactId: ids.r(2),
        index: 0,
      },
    });
    expect(rowCommand(row(4), press("ArrowDown", { altKey: true }))).toBeNull();
    expect(rowCommand(row(0), press("ArrowDown", { altKey: true }))).toEqual({
      kind: "action",
      action: { kind: "moveGroup", groupId: ids.g(1), parent: null, index: 1 },
    });
    expect(rowCommand(row(8), press("ArrowUp", { altKey: true }))).toBeNull();
  });

  it("renames with F2 and deletes with Delete, asking first for a group", () => {
    expect(rowCommand(row(0), press("F2"))).toEqual({ kind: "rename" });
    expect(rowCommand(row(0), press("Delete"))).toEqual({
      kind: "confirmDelete",
    });
    expect(rowCommand(row(3), press("Delete"))).toEqual({
      kind: "action",
      action: {
        kind: "removeFromGroup",
        artefactId: ids.r(1),
        groupId: ids.g(1),
      },
    });
    expect(rowCommand(row(8), press("Delete"))).toBeNull();
  });
});
