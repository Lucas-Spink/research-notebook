import { describe, expect, it } from "vitest";
import { allowsArtefactTrigger } from "./trigger";

describe("allowsArtefactTrigger (FR-EDT-04)", () => {
  it("allows the start of a line", () => {
    expect(allowsArtefactTrigger("")).toBe(true);
  });

  it("allows after a space", () => {
    expect(allowsArtefactTrigger("See ")).toBe(true);
  });

  it("allows after a tab or newline", () => {
    expect(allowsArtefactTrigger("a\t")).toBe(true);
    expect(allowsArtefactTrigger("a\n")).toBe(true);
  });

  it("allows after an opening bracket", () => {
    expect(allowsArtefactTrigger("See (")).toBe(true);
    expect(allowsArtefactTrigger("List [")).toBe(true);
    expect(allowsArtefactTrigger("Set {")).toBe(true);
  });

  it("refuses mid-word", () => {
    expect(allowsArtefactTrigger("email")).toBe(false);
  });

  it("refuses after ordinary punctuation", () => {
    expect(allowsArtefactTrigger("See,")).toBe(false);
    expect(allowsArtefactTrigger("See.")).toBe(false);
    expect(allowsArtefactTrigger("closed)")).toBe(false);
  });
});
