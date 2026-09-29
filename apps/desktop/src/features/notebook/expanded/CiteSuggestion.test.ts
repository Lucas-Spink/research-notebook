import { CITATION_NODE_NAME } from "@research-notebook/format";
import type { JSONContent, Range } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { CITE_MENU_ITEM } from "./SlashMenu";
import {
  matchingItems,
  openCitationPicker,
  insertCitation,
  type CitationInsertableEditor,
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

function fakeInsertableEditor() {
  const calls: string[] = [];
  let inserted: { position: number; content: JSONContent } | null = null;
  const chain = {
    focus: () => {
      calls.push("focus");
      return chain;
    },
    insertContentAt: (position: number, content: JSONContent) => {
      inserted = { position, content };
      calls.push("insertContentAt");
      return chain;
    },
    run: () => {
      calls.push("run");
      return true;
    },
  };
  const editor: CitationInsertableEditor = { chain: () => chain };
  return { editor, calls, inserted: () => inserted };
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

describe("insertCitation (FR-CIT-03, S5-T03)", () => {
  it("focuses, inserts at the given position, then runs the chain, in order", () => {
    const { editor, calls } = fakeInsertableEditor();
    insertCitation(editor, 5, "[@z:u:7XK2PQ9M]");
    expect(calls).toEqual(["focus", "insertContentAt", "run"]);
  });

  it("inserts a real citation node, not literal text (avoids the generic Markdown escaper corrupting the brackets on save)", () => {
    const { editor, inserted } = fakeInsertableEditor();
    insertCitation(editor, 5, "[@z:u:7XK2PQ9M]");
    expect(inserted()).toEqual({
      position: 5,
      content: {
        type: CITATION_NODE_NAME,
        attrs: {
          items: [
            {
              prefix: "",
              suppressAuthor: false,
              citekey: "z:u:7XK2PQ9M",
              suffix: "",
            },
          ],
        },
      },
    });
  });

  it("inserts a multi-item cluster with its locator suffix intact", () => {
    const { editor, inserted } = fakeInsertableEditor();
    insertCitation(editor, 0, "[@z:u:7XK2PQ9M, figure 2]");
    expect(inserted()?.content.attrs?.items).toEqual([
      {
        prefix: "",
        suppressAuthor: false,
        citekey: "z:u:7XK2PQ9M",
        suffix: "figure 2",
      },
    ]);
  });
});
