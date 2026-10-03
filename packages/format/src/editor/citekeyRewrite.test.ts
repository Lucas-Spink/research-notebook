import { describe, expect, it } from "vitest";
import { citationClusters } from "./citationContext";
import { replaceCitekey } from "./citekeyRewrite";

const OLD = "z:u:AAAA2222";
const NEW = "z:u:BBBB3333";
const OTHER = "z:u:CCCC4444";

describe("replaceCitekey (FR-CIT-08)", () => {
  it("replaces the citekey and keeps prefix, locator and suffix", () => {
    expect(
      replaceCitekey(`See [see @${OLD}, pp. 10-12; @${OTHER}].`, OLD, NEW),
    ).toBe(`See [see @${NEW}, pp. 10-12; @${OTHER}].`);
  });

  it("keeps the suppress-author form and odd spacing", () => {
    expect(replaceCitekey(`[ -@${OLD} ,x]`, OLD, NEW)).toBe(`[ -@${NEW} ,x]`);
  });

  it("replaces a hand-written author-in-text form and its locator", () => {
    expect(replaceCitekey(`As @${OLD} [p. 4] argued.`, OLD, NEW)).toBe(
      `As @${NEW} [p. 4] argued.`,
    );
  });

  it("leaves other citekeys, prose and a longer citekey alone", () => {
    const text = `[@${OTHER}] and z:u:AAAA2222 and @${OLD}X and mail@${OLD}.`;
    expect(replaceCitekey(text, OLD, NEW)).toBe(text);
  });

  it("leaves code fences and inline code alone", () => {
    const text = `\`[@${OLD}]\`\n\n\`\`\`\n[@${OLD}]\n\`\`\`\n\n~~~\n@${OLD}\n~~~\n`;
    expect(replaceCitekey(text, OLD, NEW)).toBe(text);
  });

  it("rewrites a citation inside a table the editor keeps verbatim", () => {
    expect(replaceCitekey(`| a |\n| - |\n| [@${OLD}] |\n`, OLD, NEW)).toBe(
      `| a |\n| - |\n| [@${NEW}] |\n`,
    );
  });

  it("does not make a duplicate disappear", () => {
    expect(replaceCitekey(`[@${OLD}; @${NEW}]`, OLD, NEW)).toBe(
      `[@${NEW}; @${NEW}]`,
    );
  });

  it("is a no-op when from equals to, or the text is empty", () => {
    expect(replaceCitekey(`[@${OLD}]`, OLD, OLD)).toBe(`[@${OLD}]`);
    expect(replaceCitekey("", OLD, NEW)).toBe("");
  });

  it("agrees with the parser about what was replaced", () => {
    const text = `A [@${OLD}, p. 1; @${OTHER}] B @${OLD} [p. 2] \`[@${OLD}]\``;
    const before = citationClusters(text).flatMap((c) => c.items);
    const after = citationClusters(replaceCitekey(text, OLD, NEW)).flatMap(
      (c) => c.items,
    );
    expect(after).toEqual(
      before.map((i) => (i.citekey === OLD ? { ...i, citekey: NEW } : i)),
    );
  });
});
