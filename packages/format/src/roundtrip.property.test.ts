import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { document } from "../test/arbitraries";
import {
  parseDocument,
  serialiseDocument,
} from "./spikes/tiptap-markdown-nodes";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

describe("Tiptap document round-trip (spike, S1-T02)", () => {
  it("parse(serialise(doc)) deep-equals doc", () => {
    fc.assert(
      fc.property(document(), (doc) => {
        expect(parseDocument(serialiseDocument(doc))).toEqual(doc);
      }),
      { numRuns },
    );
  });
});
