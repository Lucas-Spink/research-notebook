import { describe, expect, it } from "vitest";
import { ulid } from "./ulid";

describe("ulid", () => {
  it("is all zeros for time zero and no randomness", () => {
    expect(ulid(0, new Uint8Array(10))).toBe("0".repeat(26));
  });

  it("is the largest value for the largest time and all-ones randomness", () => {
    expect(ulid(2 ** 48 - 1, new Uint8Array(10).fill(255))).toBe(
      "7ZZZZZZZZZZZZZZZZZZZZZZZZZ",
    );
  });

  it("encodes a known time", () => {
    // 1_469_918_176_385 ms is the example in the ULID specification.
    expect(ulid(1_469_918_176_385, new Uint8Array(10)).slice(0, 10)).toBe(
      "01ARYZ6S41",
    );
  });

  it("refuses a time that is negative, fractional or too large", () => {
    const bytes = new Uint8Array(10);
    expect(() => ulid(-1, bytes)).toThrow(RangeError);
    expect(() => ulid(1.5, bytes)).toThrow(RangeError);
    expect(() => ulid(2 ** 48, bytes)).toThrow(RangeError);
  });

  it("refuses the wrong number of random bytes", () => {
    expect(() => ulid(0, new Uint8Array(9))).toThrow(RangeError);
    expect(() => ulid(0, new Uint8Array(11))).toThrow(RangeError);
  });
});
