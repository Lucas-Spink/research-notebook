import { describe, expect, it } from "vitest";
import { highlightLines, type Token } from "./highlight";

const kinds = (tokens: Token[]) =>
  tokens.filter((t) => t.kind !== "plain").map((t) => [t.kind, t.text]);

describe("highlighting Python (issue #104)", () => {
  it("marks keywords, strings, numbers and comments", () => {
    const [line] = highlightLines(['if x == 3: print("hi")  # note'], "python");
    expect(kinds(line ?? [])).toEqual([
      ["keyword", "if"],
      ["number", "3"],
      ["builtin", "print"],
      ["string", '"hi"'],
      ["comment", "# note"],
    ]);
  });

  it("marks the name after def and class as a function", () => {
    const [line] = highlightLines(["def analyse(data):"], "python");
    expect(kinds(line ?? [])).toEqual([
      ["keyword", "def"],
      ["function", "analyse"],
    ]);
  });

  it("does not colour a keyword inside a word or a string", () => {
    const [a, b] = highlightLines(["important = 'if'", "iffy"], "python");
    expect(kinds(a ?? [])).toEqual([["string", "'if'"]]);
    expect(kinds(b ?? [])).toEqual([]);
  });

  it("carries a triple-quoted string across lines", () => {
    const lines = highlightLines(['x = """a', "if b", 'c""" + 1'], "python");
    expect(kinds(lines[1] ?? [])).toEqual([["string", "if b"]]);
    expect(kinds(lines[2] ?? [])).toEqual([
      ["string", 'c"""'],
      ["number", "1"],
    ]);
  });

  it("keeps a hash inside a string out of the comment", () => {
    const [line] = highlightLines(['s = "a # b"'], "python");
    expect(kinds(line ?? [])).toEqual([["string", '"a # b"']]);
  });

  it("keeps an escaped quote inside the string", () => {
    const [line] = highlightLines([String.raw`s = "a\"b" + 1`], "python");
    expect(kinds(line ?? [])).toEqual([
      ["string", String.raw`"a\"b"`],
      ["number", "1"],
    ]);
  });
});

describe("highlighting R (issue #104)", () => {
  it("marks keywords, constants, strings, numbers and comments", () => {
    const [line] = highlightLines(['if (TRUE) x <- "a" + 1.5  # why'], "r");
    expect(kinds(line ?? [])).toEqual([
      ["keyword", "if"],
      ["keyword", "TRUE"],
      ["string", '"a"'],
      ["number", "1.5"],
      ["comment", "# why"],
    ]);
  });

  it("marks a called name as a function", () => {
    const [line] = highlightLines(["fit <- lm(y ~ x, data = d)"], "r");
    expect(kinds(line ?? [])).toEqual([["function", "lm"]]);
  });

  it("allows an R string to span lines", () => {
    const lines = highlightLines(['x <- "a', 'if b"'], "r");
    expect(kinds(lines[1] ?? [])).toEqual([["string", 'if b"']]);
  });

  it("treats a dotted name as one name", () => {
    const [line] = highlightLines(["read.csv(path)"], "r");
    expect(kinds(line ?? [])).toEqual([["function", "read.csv"]]);
  });
});

describe("highlighting without a language", () => {
  it("leaves every line plain and keeps its text", () => {
    const lines = highlightLines(["if x:", "", "  y"], null);
    expect(lines).toEqual([
      [{ kind: "plain", text: "if x:" }],
      [],
      [{ kind: "plain", text: "  y" }],
    ]);
  });
});

describe("preserving the source", () => {
  it("keeps indentation, tabs and non-ASCII text exactly", () => {
    const source = ["\tx = 'é'  ", "    # ünï", ""];
    const joined = highlightLines(source, "python").map((tokens) =>
      tokens.map((t) => t.text).join(""),
    );
    expect(joined).toEqual(source);
  });
});
