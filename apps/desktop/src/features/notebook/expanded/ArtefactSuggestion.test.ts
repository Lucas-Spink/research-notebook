import { ARTEFACT_REF_NODE_NAME } from "@research-notebook/format";
import type { JSONContent, Range } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import {
  insertArtefactReference,
  type InsertableEditor,
} from "./ArtefactSuggestion";
import type { ArtefactSearchRow } from "./model/artefactSearch";

const ROW: ArtefactSearchRow = {
  id: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
  label: "PCA by treatment",
  fileName: "pca.v2.csv",
  target: "evidence/pca.v2.csv",
  type: "table",
  groupPath: "Figures",
  version: 2,
};

function fakeEditor() {
  const calls: string[] = [];
  let inserted: { range: Range; content: JSONContent } | null = null;
  const chain = {
    focus: () => {
      calls.push("focus");
      return chain;
    },
    insertContentAt: (range: Range, content: JSONContent) => {
      inserted = { range, content };
      calls.push("insertContentAt");
      return chain;
    },
    run: () => {
      calls.push("run");
      return true;
    },
  };
  const editor: InsertableEditor = { chain: () => chain };
  return { editor, calls, inserted: () => inserted };
}

describe("insertArtefactReference (FR-EDT-05)", () => {
  it("focuses, inserts at the given range, then runs the chain, in order", () => {
    const { editor, calls } = fakeEditor();
    insertArtefactReference(editor, { from: 3, to: 4 }, ROW);
    expect(calls).toEqual(["focus", "insertContentAt", "run"]);
  });

  it("inserts a node pinned to the row's version, at the exact suggestion range", () => {
    const { editor, inserted } = fakeEditor();
    insertArtefactReference(editor, { from: 3, to: 4 }, ROW);
    expect(inserted()).toEqual({
      range: { from: 3, to: 4 },
      content: {
        type: ARTEFACT_REF_NODE_NAME,
        attrs: {
          ulid: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
          version: 2,
          label: "PCA by treatment",
          target: "evidence/pca.v2.csv",
        },
      },
    });
  });
});
