import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  arrangedFrom,
  loadedExperiment,
  sequentialIds,
} from "../../test/notebook-support";
import { ArtefactsFile } from "../schema";
import { buildManifest, type ManifestObservation } from "./manifest";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

type Seen = "observed" | "missing" | "unreadable" | "absent" | "differs";

/** Characters the format forbids in single-line text. */
const hasControl = (text: string): boolean =>
  [...text].some((c) => {
    const code = c.charCodeAt(0);
    return code < 0x20 || (code >= 0x7f && code <= 0x9f);
  });

/** Group names are the person's own single-line text: commas, quotes and formula starters included. */
const groupName = fc.oneof(
  fc.constantFrom("Figures", "=SUM(A1)", "a,b", 'say "hi"', "-x"),
  fc
    .string({ minLength: 1, maxLength: 8 })
    .filter((s) => s.trim() !== "" && !hasControl(s)),
);

const file = fc.record({
  seen: fc.constantFrom<Seen>(
    "observed",
    "observed",
    "missing",
    "unreadable",
    "absent",
    "differs",
  ),
  size: fc.nat({ max: 1_000_000 }),
  hash: fc.string({
    unit: fc.constantFrom(..."0123456789abcdef"),
    minLength: 64,
    maxLength: 64,
  }),
  modified: fc.integer({ min: 0, max: 4_000_000_000_000 }),
  group: fc.option(groupName, { nil: null }),
});

/** A minimal RFC 4180 reader, so the test does not trust the writer to check the writer. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  return rows;
}

describe("buildManifest property (FR-ARC-02)", () => {
  it("lists exactly the observed files, with every cell surviving CSV", () => {
    fc.assert(
      fc.property(fc.array(file, { maxLength: 12 }), (files) => {
        const newId = sequentialIds();
        const groups = new Map<string, string[]>();
        const artefacts = files.map((f, i) => {
          const id = newId();
          if (f.group !== null)
            groups.set(f.group, [...(groups.get(f.group) ?? []), id]);
          return {
            id,
            name: `A${i}`,
            role: "result",
            mode: "copy",
            type: "other",
            source: { root: "project", path: `r/${i}.bin` },
            created: "2026-09-03T14:02:11Z",
            versions: [
              {
                v: 1,
                file: `evidence/${String(i).padStart(3, "0")}.bin`,
                sha256: f.hash,
                size: f.size,
                captured: "2026-09-03T14:02:11Z",
              },
            ],
          };
        });
        const parsed = ArtefactsFile.parse({
          format_version: 1,
          artefacts,
          groups: [...groups].map(([name, items]) => ({
            id: newId(),
            name,
            items,
            groups: [],
          })),
        });
        const arranged = arrangedFrom([
          loadedExperiment("EXP-001", "EXP-001", "Q1", {}),
        ]);
        const [item] = arranged.unassigned;
        if (item === undefined) throw new Error("fixture");
        item.artefacts = { kind: "file", file: parsed };

        const seen = new Map<string, ManifestObservation>();
        const path = (i: number) =>
          `_notebook/experiments/EXP-001/evidence/${String(i).padStart(3, "0")}.bin`;
        files.forEach((f, i) => {
          if (f.seen === "absent") return;
          seen.set(
            path(i),
            f.seen === "missing" || f.seen === "unreadable"
              ? { kind: f.seen }
              : {
                  kind: "observed",
                  size: f.seen === "differs" ? f.size + 1 : f.size,
                  modifiedMs: f.modified,
                  sha256: f.hash,
                },
          );
        });

        const { csv, rows, problems } = buildManifest(arranged, seen);

        const expected = files
          .map((f, i) => ({ f, i }))
          .filter(({ f }) => f.seen === "observed" || f.seen === "differs");
        expect(rows.map((r) => r.path)).toEqual(
          expected.map(({ i }) => path(i)),
        );
        expect(problems).toHaveLength(
          files.filter((f) => f.seen !== "observed").length,
        );

        const table = parseCsv(csv);
        expect(table).toHaveLength(1 + expected.length);
        expected.forEach(({ f, i }, n) => {
          const cells = table[n + 1] ?? [];
          expect(cells.slice(0, 2)).toEqual([
            path(i),
            String(f.seen === "differs" ? f.size + 1 : f.size),
          ]);
          expect(cells[3]).toBe(f.hash);
          expect(cells[4]).toBe("EXP-001");
          const group = f.group ?? "";
          // An apostrophe is added only where a spreadsheet could read a formula.
          const formula = ["=", "+", "-", "@"].some((c) => group.startsWith(c));
          expect(cells[5]).toBe(formula ? `'${group}` : group);
        });
      }),
      { numRuns },
    );
  });
});
