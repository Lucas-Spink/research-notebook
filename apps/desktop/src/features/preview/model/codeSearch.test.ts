import { describe, expect, it } from "vitest";
import type { Token } from "./highlight";
import { findMatches, splitByMatches } from "./codeSearch";

describe("searching a script (issue #104)", () => {
  const lines = ["import pandas as pd", "PD = pd.read_csv(p)", ""];

  it("finds every match, ignoring case, in reading order", () => {
    expect(findMatches(lines, "pd")).toEqual([
      { line: 0, start: 17, length: 2 },
      { line: 1, start: 0, length: 2 },
      { line: 1, start: 5, length: 2 },
    ]);
  });

  it("finds nothing for an empty query", () => {
    expect(findMatches(lines, "")).toEqual([]);
  });

  it("treats the query as plain text, not a pattern", () => {
    expect(findMatches(["a.c", "abc"], "a.c")).toEqual([
      { line: 0, start: 0, length: 3 },
    ]);
    expect(findMatches(["(x)"], "(")).toHaveLength(1);
  });

  it("does not count overlapping matches twice", () => {
    expect(findMatches(["aaaa"], "aa")).toHaveLength(2);
  });

  it("stops at a limit, so a one-letter query in a huge file stays fast", () => {
    const many = Array.from({ length: 10 }, () => "aaaa");
    expect(findMatches(many, "a", 7)).toHaveLength(7);
  });
});

describe("marking matches in a line's tokens", () => {
  const tokens: Token[] = [
    { kind: "keyword", text: "import" },
    { kind: "plain", text: " pandas" },
  ];

  it("splits tokens at the edges of a match and keeps their colours", () => {
    const parts = splitByMatches(tokens, [{ start: 3, length: 6 }]);
    expect(parts).toEqual([
      { kind: "keyword", text: "imp", range: null },
      { kind: "keyword", text: "ort", range: 0 },
      { kind: "plain", text: " pa", range: 0 },
      { kind: "plain", text: "ndas", range: null },
    ]);
  });

  it("returns the tokens unmarked when nothing matches", () => {
    expect(splitByMatches(tokens, [])).toEqual([
      { kind: "keyword", text: "import", range: null },
      { kind: "plain", text: " pandas", range: null },
    ]);
  });

  it("keeps all the text however the matches fall", () => {
    const parts = splitByMatches(tokens, [
      { start: 0, length: 2 },
      { start: 6, length: 1 },
    ]);
    expect(parts.map((p) => p.text).join("")).toBe("import pandas");
  });
});
