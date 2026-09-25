import type { JSONContent } from "@tiptap/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  arrangedFrom,
  loadedExperiment,
  sequentialIds,
} from "../../test/notebook-support";
import { parseSectionMarkdown, serialiseSectionMarkdown } from "../editor";
import type { LoadedExperiment } from "./types";
import {
  buildReferenceIndex,
  referencedIn,
  type ReferenceLocation,
} from "./references";

/**
 * S4-G07: the lookup a person sees in the artefact panel must equal a
 * brute-force scan of every file. `bruteForce` below is a second, independent
 * walk of the same generated experiments — it does not call
 * `buildReferenceIndex` or share any of its aggregation code, only the one
 * real parser (`parseSectionMarkdown`, AGENTS.md rule 2) `references.ts`
 * itself uses.
 */

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

// A small, fixed, valid-Crockford pool, unlike test/arbitraries.ts's
// `artefactRefNode`, which draws a fresh random ULID per node and so almost
// never repeats one: this feature is precisely about several locations
// sharing one artefact.
const nextId = sequentialIds();
const POOL = [nextId(), nextId(), nextId()];

function wordNode(): fc.Arbitrary<JSONContent> {
  return fc
    .constantFrom("alpha", "beta", "gamma", "delta")
    .map((text) => ({ type: "text", text }));
}

function poolRefNode(): fc.Arbitrary<JSONContent> {
  return fc.constantFrom(...POOL).map((ulid) => ({
    type: "artefactRef",
    attrs: { ulid, version: null, label: "ref", target: "x" },
  }));
}

/** One section's raw Markdown, always produced by `serialiseSectionMarkdown`
 * (never a hand-built string), so it is exactly the text the app itself
 * would save, with words separating any two references. */
function sectionBody(): fc.Arbitrary<string> {
  return fc
    .array(fc.oneof(wordNode(), poolRefNode()), { minLength: 0, maxLength: 5 })
    .map((nodes) => {
      const content: JSONContent[] = [{ type: "text", text: "start" }];
      for (const node of nodes) {
        content.push(node, { type: "text", text: "then" });
      }
      return serialiseSectionMarkdown({
        type: "doc",
        content: [{ type: "paragraph", content }],
      });
    });
}

function experimentsArb(): fc.Arbitrary<LoadedExperiment[]> {
  return fc
    .array(
      fc.record({
        methods: sectionBody(),
        results_notes: sectionBody(),
        interpretation: sectionBody(),
      }),
      { minLength: 1, maxLength: 4 },
    )
    .map((sectionsList) =>
      sectionsList.map((sections, index) =>
        loadedExperiment(`EXP-${index}`, `EXP-${index}`, "Q1", sections),
      ),
    );
}

function refUlid(node: JSONContent): string | null {
  const attrs: Record<string, unknown> | undefined = node.attrs;
  return typeof attrs?.ulid === "string" ? attrs.ulid : null;
}

function countMatches(node: JSONContent, target: string): number {
  const here = node.type === "artefactRef" && refUlid(node) === target ? 1 : 0;
  return (
    here +
    (node.content ?? []).reduce(
      (sum, child) => sum + countMatches(child, target),
      0,
    )
  );
}

function bruteForce(
  experiments: readonly LoadedExperiment[],
  target: string,
): ReferenceLocation[] {
  const found: ReferenceLocation[] = [];
  for (const experiment of experiments) {
    const { ref, title } = experiment.file.frontmatter;
    for (const section of experiment.file.body.sections) {
      if (section.key === "unknown") continue;
      const matches = countMatches(parseSectionMarkdown(section.body), target);
      for (let i = 0; i < matches; i += 1) {
        found.push({
          experimentFolder: experiment.folder,
          experimentRef: ref,
          experimentTitle: title,
          section: section.key,
        });
      }
    }
  }
  return found;
}

describe("buildReferenceIndex / referencedIn", () => {
  it("equals a brute-force scan of every experiment and section, for every artefact", () => {
    fc.assert(
      fc.property(experimentsArb(), (experiments) => {
        const index = buildReferenceIndex(arrangedFrom(experiments));
        for (const target of POOL) {
          expect(referencedIn(index, target)).toEqual(
            bruteForce(experiments, target),
          );
        }
      }),
      { numRuns },
    );
  });
});
