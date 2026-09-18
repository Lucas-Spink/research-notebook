import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ArtefactsFile,
  ProjectYaml,
  RelativePath,
  Sha256,
  Timestamp,
  Ulid,
} from "../src/schema";
import { relativePathSegments, sha256, timestamp, ulid } from "./arbitraries";
import { hex64, projectSample, setIn } from "./samples";

const numRuns = Number(process.env["FC_NUM_RUNS"] ?? 200);

function accepts(
  schema: { safeParse: (v: unknown) => { success: boolean } },
  value: unknown,
) {
  return schema.safeParse(value).success;
}

function replaceAt(text: string, index: number, replacement: string): string {
  return text.slice(0, index) + replacement + text.slice(index + 1);
}

describe("ULID grammar", () => {
  it("accepts every generated ULID", () => {
    fc.assert(
      fc.property(ulid(), (id) => accepts(Ulid, id)),
      { numRuns },
    );
  });

  it("rejects a ULID with any position replaced by a forbidden character", () => {
    fc.assert(
      fc.property(
        ulid(),
        fc.nat({ max: 25 }),
        fc.constantFrom(..."ILOUilou_-*"),
        (id, index, bad) => {
          expect(accepts(Ulid, replaceAt(id, index, bad))).toBe(false);
        },
      ),
      { numRuns },
    );
  });

  it("rejects a ULID that is shortened or lengthened", () => {
    fc.assert(
      fc.property(ulid(), (id) => {
        expect(accepts(Ulid, id.slice(1))).toBe(false);
        expect(accepts(Ulid, `${id}0`)).toBe(false);
      }),
      { numRuns },
    );
  });
});

describe("timestamp grammar", () => {
  it("accepts every second-precision UTC timestamp", () => {
    fc.assert(
      fc.property(timestamp(), (value) => accepts(Timestamp, value)),
      { numRuns },
    );
  });

  it("rejects the same instant written with fractional seconds, an offset or no zone", () => {
    fc.assert(
      fc.property(timestamp(), (value) => {
        expect(accepts(Timestamp, value.replace("Z", ".000Z"))).toBe(false);
        expect(accepts(Timestamp, value.replace("Z", "+00:00"))).toBe(false);
        expect(accepts(Timestamp, value.replace("Z", ""))).toBe(false);
      }),
      { numRuns },
    );
  });
});

describe("relative path grammar", () => {
  it("accepts any path of plain segments joined by forward slashes", () => {
    fc.assert(
      fc.property(relativePathSegments(), (segments) =>
        accepts(RelativePath, segments.join("/")),
      ),
      { numRuns },
    );
  });

  it("rejects the same path once it is made absolute, backslashed or traversing", () => {
    fc.assert(
      fc.property(
        relativePathSegments(),
        fc.nat({ max: 4 }),
        (segments, at) => {
          const joined = segments.join("/");
          expect(accepts(RelativePath, `/${joined}`)).toBe(false);
          expect(accepts(RelativePath, `C:/${joined}`)).toBe(false);
          expect(accepts(RelativePath, `${joined}/`)).toBe(false);
          expect(accepts(RelativePath, segments.join("\\") + "\\x")).toBe(
            false,
          );
          const index = at % (segments.length + 1);
          const withDots = [
            ...segments.slice(0, index),
            "..",
            ...segments.slice(index),
          ];
          expect(accepts(RelativePath, withDots.join("/"))).toBe(false);
          const withEmpty = [
            ...segments.slice(0, index),
            "",
            ...segments.slice(index),
          ];
          expect(accepts(RelativePath, withEmpty.join("/"))).toBe(false);
        },
      ),
      { numRuns },
    );
  });
});

describe("SHA-256 grammar", () => {
  it("accepts generated digests and rejects them uppercased, truncated or extended", () => {
    fc.assert(
      fc.property(sha256(), (digest) => {
        expect(accepts(Sha256, digest)).toBe(true);
        expect(accepts(Sha256, digest.slice(1))).toBe(false);
        expect(accepts(Sha256, `${digest}0`)).toBe(false);
        if (/[a-f]/.test(digest))
          expect(accepts(Sha256, digest.toUpperCase())).toBe(false);
      }),
      { numRuns },
    );
  });
});

describe("unknown keys", () => {
  it("survive validation of project.yaml wherever they are added", () => {
    const extraKey = fc.stringMatching(/^x_[a-z0-9]{1,8}$/);
    fc.assert(
      fc.property(
        extraKey,
        fc.string(),
        fc.constantFrom<string[]>([], ["capture"], ["numbering"], ["table"]),
        (key, value, parent) => {
          const result = ProjectYaml.safeParse(
            setIn(projectSample, [...parent, key], value),
          );
          expect(result.success).toBe(true);
          const [section] = parent;
          const expected: Record<string, unknown> =
            section === undefined
              ? { [key]: value }
              : { [section]: { [key]: value } };
          if (result.success) expect(result.data).toMatchObject(expected);
        },
      ),
      { numRuns },
    );
  });
});

describe("group membership constraints", () => {
  function fileWithGroup(ids: string[], items: string[]): unknown {
    return {
      format_version: 1,
      artefacts: ids.map((id, i) => ({
        id,
        name: `Result ${i}`,
        role: "result",
        mode: "copy",
        type: "image",
        source: { root: "project", path: `results/r${i}.png` },
        created: "2026-09-03T14:02:11Z",
        versions: [
          {
            v: 1,
            file: `evidence/r${i}.png`,
            sha256: hex64("ab"),
            size: 1,
            captured: "2026-09-03T14:02:11Z",
          },
        ],
      })),
      groups: [
        { id: "01JAXS0A2B4C6D8E0F2G4H6J8K", name: "G", items, groups: [] },
      ],
    };
  }

  it("accepts any subset of result artefacts as the items of a group", () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(ulid(), { minLength: 1, maxLength: 12 })
          .chain((ids) => fc.tuple(fc.constant(ids), fc.shuffledSubarray(ids))),
        ([ids, items]) => accepts(ArtefactsFile, fileWithGroup(ids, items)),
      ),
      { numRuns },
    );
  });

  it("rejects the group once any member is listed twice", () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(ulid(), { minLength: 1, maxLength: 12 })
          .chain((ids) =>
            fc.tuple(
              fc.constant(ids),
              fc.shuffledSubarray(ids, { minLength: 1 }),
            ),
          ),
        ([ids, items]) => {
          const first = items[0] ?? ids[0] ?? "";
          expect(
            accepts(ArtefactsFile, fileWithGroup(ids, [...items, first])),
          ).toBe(false);
        },
      ),
      { numRuns },
    );
  });

  it("rejects the group once an item is not a known artefact", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(ulid(), { minLength: 2, maxLength: 12 }),
        (ids) => {
          const [stranger, ...known] = ids;
          expect(
            accepts(
              ArtefactsFile,
              fileWithGroup(known, [...known, stranger ?? ""]),
            ),
          ).toBe(false);
        },
      ),
      { numRuns },
    );
  });
});
