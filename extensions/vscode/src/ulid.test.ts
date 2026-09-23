import { describe, expect, it } from "vitest";

import { newUlid, ulid } from "./ulid";

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("ulid", () => {
  it("encodes 26 characters of Crockford Base32", () => {
    const id = ulid(1_700_000_000_000, new Uint8Array(10).fill(1));
    expect(id).toMatch(CROCKFORD);
  });

  it("is deterministic for the same time and random bytes", () => {
    const random = new Uint8Array(10).fill(7);
    expect(ulid(1_700_000_000_000, random)).toBe(
      ulid(1_700_000_000_000, random),
    );
  });

  it("sorts by time first", () => {
    const random = new Uint8Array(10).fill(0);
    const earlier = ulid(1_700_000_000_000, random);
    const later = ulid(1_700_000_000_001, random);
    expect(earlier < later).toBe(true);
  });
});

describe("newUlid", () => {
  it("produces a valid, unique ULID each time", () => {
    const a = newUlid();
    const b = newUlid();
    expect(a).toMatch(CROCKFORD);
    expect(b).toMatch(CROCKFORD);
    expect(a).not.toBe(b);
  });
});
