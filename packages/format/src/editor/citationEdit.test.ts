import { describe, expect, it } from "vitest";
import { appendCitation, citesCitekey, removeCitekey } from "./citationEdit";

const A = "z:u:AAAA2222";
const B = "z:u:BBBB3333";

describe("removeCitekey (detaching a source)", () => {
  it("takes out a citation of only that source, with the space before it", () => {
    expect(removeCitekey(`Counts were normalised [@${A}].`, A)).toBe(
      "Counts were normalised.",
    );
  });

  it("removes just its own item from a cluster of several", () => {
    expect(removeCitekey(`See [@${A}, p. 3; @${B}] here.`, A)).toBe(
      `See [@${B}] here.`,
    );
    expect(removeCitekey(`See [@${B}; -@${A}, p. 3] here.`, A)).toBe(
      `See [@${B}] here.`,
    );
  });

  it("removes the author-in-text form", () => {
    expect(removeCitekey(`As @${A} showed.`, A)).toBe("As showed.");
  });

  it("leaves other sources, code spans, code fences and plain brackets alone", () => {
    const text = [
      `Keep [@${B}] and \`[@${A}]\` and [a link](x).`,
      "```",
      `[@${A}]`,
      "```",
    ].join("\n");
    expect(removeCitekey(text, A)).toBe(text);
  });

  it("returns text without the source untouched", () => {
    const text = "Nothing cited here.\n";
    expect(removeCitekey(text, A)).toBe(text);
  });
});

describe("appendCitation (attaching a source)", () => {
  it("adds the citation as a paragraph of its own and keeps the trailing newline", () => {
    expect(appendCitation("Methods text.\n", A)).toBe(
      `Methods text.\n\n[@${A}]\n`,
    );
    expect(appendCitation("Methods text.", A)).toBe(`Methods text.\n\n[@${A}]`);
  });

  it("writes only the citation into an empty section", () => {
    expect(appendCitation("", A)).toBe(`[@${A}]`);
    expect(appendCitation("\n", A)).toBe(`[@${A}]\n`);
  });

  it("does not cite a source twice", () => {
    const text = `Already [@${A}].`;
    expect(appendCitation(text, A)).toBe(text);
  });

  it("is undone by removeCitekey", () => {
    const attached = appendCitation("Methods text.", A);
    expect(citesCitekey(attached, A)).toBe(true);
    expect(removeCitekey(attached, A).trim()).toBe("Methods text.");
    expect(citesCitekey(removeCitekey(attached, A), A)).toBe(false);
  });
});
