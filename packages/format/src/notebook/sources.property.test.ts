import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BibliographyFile, type BibliographyFileModel } from "../schema";
import { markSourceMissing, upsertSource, type FetchedSource } from "./sources";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);
const NOW = () => new Date("2026-10-02T10:00:00Z");

const keyChars = [..."23456789ABCDEFGHJKLMNPQRSTUVWXYZ"];
const itemKey = fc
  .array(fc.constantFrom(...keyChars), { minLength: 8, maxLength: 8 })
  .map((chars) => chars.join(""));
const library = fc.oneof(
  fc.constant("u"),
  fc.nat({ max: 999 }).map((n) => `g${n}`),
);
const serverId = fc.option(fc.constantFrom("srv-1", "srv-2"), { nil: null });
const cslFields = fc.record({
  type: fc.constantFrom("book", "article-journal"),
  title: fc.string({ minLength: 1, maxLength: 20 }),
});

const source: fc.Arbitrary<FetchedSource> = fc.record({
  library,
  key: itemKey,
  serverId,
  trashed: fc.boolean(),
  csl: cslFields,
});

/** Applies each source in turn, confirming any server change so every step lands. */
function applyAll(sources: FetchedSource[]): BibliographyFileModel {
  let file: BibliographyFileModel = [];
  for (const next of sources) {
    const result = upsertSource(file, next, NOW, { confirmServerChange: true });
    if (!result.ok) throw new Error("a confirmed upsert must not fail");
    file = result.value.file;
  }
  return file;
}

describe("upsertSource properties", () => {
  it("always yields a file that satisfies the bibliography schema", () => {
    fc.assert(
      fc.property(fc.array(source, { maxLength: 12 }), (sources) => {
        expect(BibliographyFile.safeParse(applyAll(sources)).success).toBe(
          true,
        );
      }),
      { numRuns },
    );
  });

  it("never removes a source", () => {
    fc.assert(
      fc.property(
        fc.array(source, { maxLength: 12 }),
        source,
        (sources, next) => {
          const before = applyAll(sources);
          const after = applyAll([...sources, next]);
          const ids = new Set(after.map((item) => item.id));
          for (const item of before) expect(ids.has(item.id)).toBe(true);
        },
      ),
      { numRuns },
    );
  });

  it("is idempotent: the same fetch twice changes nothing the second time", () => {
    fc.assert(
      fc.property(
        fc.array(source, { maxLength: 8 }),
        source,
        (sources, next) => {
          const once = upsertSource(applyAll(sources), next, NOW, {
            confirmServerChange: true,
          });
          if (!once.ok) throw new Error("confirmed upsert failed");
          const twice = upsertSource(once.value.file, next, NOW, {
            confirmServerChange: true,
          });
          expect(twice.ok && twice.value.change).toBe("unchanged");
          expect(twice.ok && twice.value.file).toEqual(once.value.file);
        },
      ),
      { numRuns },
    );
  });

  it("leaves every other item untouched", () => {
    fc.assert(
      fc.property(
        fc.array(source, { maxLength: 8 }),
        source,
        (sources, next) => {
          const before = applyAll(sources);
          const result = upsertSource(before, next, NOW, {
            confirmServerChange: true,
          });
          if (!result.ok) throw new Error("confirmed upsert failed");
          const touched = `z:${next.library}:${next.key}`;
          for (const item of before) {
            if (item.id === touched) continue;
            expect(result.value.file).toContain(item);
          }
        },
      ),
      { numRuns },
    );
  });

  it("without confirmation, a refused upsert returns an error and no file", () => {
    fc.assert(
      fc.property(source, (first) => {
        fc.pre(first.serverId !== null);
        const file = applyAll([first]);
        const other: FetchedSource = {
          ...first,
          serverId: first.serverId === "srv-1" ? "srv-2" : "srv-1",
        };
        const result = upsertSource(file, other, NOW);
        expect(result.ok).toBe(false);
      }),
      { numRuns },
    );
  });
});

describe("markSourceMissing properties", () => {
  it("keeps the number and order of items", () => {
    fc.assert(
      fc.property(
        fc.array(source, { minLength: 1, maxLength: 8 }),
        (sources) => {
          const file = applyAll(sources);
          const target = file[0]?.id ?? "";
          const result = markSourceMissing(file, target);
          expect(result.file.map((item) => item.id)).toEqual(
            file.map((item) => item.id),
          );
        },
      ),
      { numRuns },
    );
  });
});
