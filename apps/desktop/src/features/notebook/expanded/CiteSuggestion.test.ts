import type { Range } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { CITE_MENU_ITEM } from "./SlashMenu";
import {
  matchingItems,
  openCitationPicker,
  type DeletableEditor,
} from "./CiteSuggestion";

function fakeEditor() {
  const calls: string[] = [];
  let deleted: Range | null = null;
  const chain = {
    focus: () => {
      calls.push("focus");
      return chain;
    },
    deleteRange: (range: Range) => {
      deleted = range;
      calls.push("deleteRange");
      return chain;
    },
    run: () => {
      calls.push("run");
      return true;
    },
  };
  const editor: DeletableEditor = { chain: () => chain };
  return { editor, calls, deleted: () => deleted };
}

describe("matchingItems", () => {
  it("offers Cite for an empty query", () => {
    expect(matchingItems("")).toEqual([CITE_MENU_ITEM]);
  });

  it("matches the item's label case-insensitively", () => {
    expect(matchingItems("ci")).toEqual([CITE_MENU_ITEM]);
    expect(matchingItems("CITE")).toEqual([CITE_MENU_ITEM]);
  });

  it("offers nothing for a query matching no item", () => {
    expect(matchingItems("xyz")).toEqual([]);
  });
});

describe("openCitationPicker (FR-CIT-03)", () => {
  it("focuses, deletes the trigger range, then runs the chain, in order", () => {
    const { editor, calls } = fakeEditor();
    openCitationPicker(editor, { from: 3, to: 8 }, () => undefined);
    expect(calls).toEqual(["focus", "deleteRange", "run"]);
  });

  it("deletes exactly the trigger range", () => {
    const { editor, deleted } = fakeEditor();
    openCitationPicker(editor, { from: 3, to: 8 }, () => undefined);
    expect(deleted()).toEqual({ from: 3, to: 8 });
  });

  it("opens the picker at the range's start, where the trigger text was", () => {
    const { editor } = fakeEditor();
    const positions: number[] = [];
    openCitationPicker(editor, { from: 3, to: 8 }, (position) =>
      positions.push(position),
    );
    expect(positions).toEqual([3]);
  });
});
