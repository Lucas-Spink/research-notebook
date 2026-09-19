import { Ulid } from "@research-notebook/format";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createUlidGenerator, ulid } from "./ulid";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

const times = fc.integer({ min: 0, max: 2 ** 48 - 1 });
const randomBytes = fc.uint8Array({ minLength: 10, maxLength: 10 });

/** Decodes the 10 time characters back to milliseconds. */
function decodeTime(text: string): number {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  return [...text.slice(0, 10)].reduce(
    (total, char) => total * 32 + alphabet.indexOf(char),
    0,
  );
}

describe("ulid", () => {
  it("always satisfies the format package's ULID grammar", () => {
    fc.assert(
      fc.property(times, randomBytes, (time, bytes) => {
        expect(Ulid.safeParse(ulid(time, bytes)).success).toBe(true);
      }),
      { numRuns },
    );
  });

  it("keeps the time in the first ten characters", () => {
    fc.assert(
      fc.property(times, randomBytes, (time, bytes) => {
        expect(decodeTime(ulid(time, bytes))).toBe(time);
      }),
      { numRuns },
    );
  });

  it("sorts by time", () => {
    fc.assert(
      fc.property(times, times, randomBytes, randomBytes, (a, b, x, y) => {
        fc.pre(a !== b);
        expect(ulid(a, x) < ulid(b, y)).toBe(a < b);
      }),
      { numRuns },
    );
  });

  it("differs when the random bytes differ", () => {
    fc.assert(
      fc.property(times, randomBytes, randomBytes, (time, x, y) => {
        fc.pre(x.join() !== y.join());
        expect(ulid(time, x)).not.toBe(ulid(time, y));
      }),
      { numRuns },
    );
  });
});

describe("createUlidGenerator", () => {
  it("uses the injected clock and random source", () => {
    const next = createUlidGenerator(
      () => new Date("2026-09-19T08:30:15Z"),
      (length) => new Uint8Array(length),
    );
    const id = next();
    expect(id).toBe(
      ulid(Date.parse("2026-09-19T08:30:15Z"), new Uint8Array(10)),
    );
    expect(id.endsWith("0000000000000000")).toBe(true);
  });
});
