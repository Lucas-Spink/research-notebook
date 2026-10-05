import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { manifestCell } from "./manifest";
import { parseManifest } from "./manifestParse";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

/** File names are the person's own text: commas, quotes, newlines and formula starters included. */
const name = fc.oneof(
  fc.constantFrom(
    "=a.png",
    "a,b.png",
    'say "hi".png',
    "-x",
    "+1",
    "@m",
    "\tt",
    "'q",
  ),
  fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !s.includes("/")),
);

const entry = fc.record({
  folder: fc.constantFrom("evidence", "methods"),
  name,
  size: fc.nat({ max: Number.MAX_SAFE_INTEGER }),
  sha256: fc.stringMatching(/^[0-9a-f]{64}$/),
});

describe("parseManifest property (FR-ARC-03)", () => {
  it("reads back exactly the entries buildManifest's cells wrote", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(entry, {
          selector: (e) => `${e.folder}/${e.name}`,
          maxLength: 6,
        }),
        (entries) => {
          const expected = entries.map((e) => ({
            path: `_notebook/experiments/EXP-001/${e.folder}/${e.name}`,
            size: e.size,
            sha256: e.sha256,
          }));
          const lines = expected.map((e) =>
            [
              manifestCell(e.path),
              e.size,
              "2026-09-05T09:40:52Z",
              e.sha256,
              "EXP-001",
              manifestCell("a,b"),
            ].join(","),
          );
          const csv = `path,size,modified,sha256,experiments,groups\n${lines.map((l) => `${l}\n`).join("")}`;
          expect(parseManifest(csv)).toEqual({ ok: true, value: expected });
        },
      ),
      { numRuns },
    );
  });
});
