import fc from "fast-check";
import { describe, it } from "vitest";
import { highlightLines } from "./highlight";

// Highlighting only ever colours text. Whatever the source holds, including
// unterminated strings and odd characters, the tokens of each line must join
// back to that line, or the viewer would show code that is not in the file.
const line = fc
  .string({ unit: "binary", maxLength: 80 })
  .map((text) => text.replace(/[\r\n]/g, " "));

describe("highlightLines (property)", () => {
  it.each(["python", "r", null] as const)(
    "rebuilds every line exactly for %s",
    (language) => {
      fc.assert(
        fc.property(fc.array(line, { maxLength: 30 }), (lines) => {
          const rebuilt = highlightLines(lines, language).map((tokens) =>
            tokens.map((token) => token.text).join(""),
          );
          return JSON.stringify(rebuilt) === JSON.stringify(lines);
        }),
        { numRuns: Number(process.env["FC_NUM_RUNS"] ?? 200) },
      );
    },
  );
});
