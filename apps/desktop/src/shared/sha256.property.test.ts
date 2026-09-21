import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, it } from "vitest";
import { sha256Hex } from "./sha256";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

describe("sha256Hex", () => {
  it("equals the platform's SHA-256 of the UTF-8 bytes for any text", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 300 }), (text) => {
        const expected = createHash("sha256")
          .update(text, "utf8")
          .digest("hex");
        if (sha256Hex(text) !== expected) {
          throw new Error(`hash differs for ${JSON.stringify(text)}`);
        }
      }),
      { numRuns },
    );
  });
});
