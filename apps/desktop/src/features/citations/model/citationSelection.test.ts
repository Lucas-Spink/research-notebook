import { describe, expect, it } from "vitest";
import {
  buildCitationMarkdown,
  newSelectionItem,
  toggleSelection,
  updateSelection,
  type CitationSelectionItem,
} from "./citationSelection";

const SOURCE = newSelectionItem("z:u:7XK2PQ9M", "A Study of Widgets");
const OTHER = newSelectionItem("z:u:9HJ3LM2N", "Another Study");

describe("toggleSelection", () => {
  it("adds an item not yet selected", () => {
    expect(toggleSelection([], SOURCE)).toEqual([SOURCE]);
  });

  it("removes an item already selected, by citekey", () => {
    expect(toggleSelection([SOURCE], SOURCE)).toEqual([]);
  });

  it("leaves other selected items untouched", () => {
    expect(toggleSelection([SOURCE, OTHER], SOURCE)).toEqual([OTHER]);
  });
});

describe("updateSelection", () => {
  it("updates only the matching citekey's fields", () => {
    const next = updateSelection([SOURCE, OTHER], SOURCE.citekey, {
      prefix: "see",
    });
    expect(next).toEqual([{ ...SOURCE, prefix: "see" }, OTHER]);
  });

  it("leaves fields not named in changes alone", () => {
    const withPrefix = updateSelection([SOURCE], SOURCE.citekey, {
      prefix: "see",
    });
    const next = updateSelection(withPrefix, SOURCE.citekey, {
      suffix: "emphasis added",
    });
    expect(next).toEqual([
      { ...SOURCE, prefix: "see", suffix: "emphasis added" },
    ]);
  });
});

describe("buildCitationMarkdown", () => {
  it("is empty for no selection", () => {
    expect(buildCitationMarkdown([])).toBe("");
  });

  it("wraps a single bare citekey in brackets (spec 5.7)", () => {
    expect(buildCitationMarkdown([SOURCE])).toBe("[@z:u:7XK2PQ9M]");
  });

  it("adds a locator as a full term and value after a comma", () => {
    const item: CitationSelectionItem = {
      ...SOURCE,
      locatorTerm: "figure",
      locatorValue: "2",
    };
    expect(buildCitationMarkdown([item])).toBe("[@z:u:7XK2PQ9M, figure 2]");
  });

  it("adds a prefix before the citekey, separated by a space", () => {
    const item: CitationSelectionItem = { ...SOURCE, prefix: "see" };
    expect(buildCitationMarkdown([item])).toBe("[see @z:u:7XK2PQ9M]");
  });

  it("adds a suffix after the locator, comma-separated", () => {
    const item: CitationSelectionItem = {
      ...SOURCE,
      locatorTerm: "page",
      locatorValue: "6",
      suffix: "emphasis added",
    };
    expect(buildCitationMarkdown([item])).toBe(
      "[@z:u:7XK2PQ9M, page 6, emphasis added]",
    );
  });

  it("adds a suffix alone, with no locator, comma-separated", () => {
    const item: CitationSelectionItem = { ...SOURCE, suffix: "emphasis added" };
    expect(buildCitationMarkdown([item])).toBe(
      "[@z:u:7XK2PQ9M, emphasis added]",
    );
  });

  it("ignores a locator term with no value", () => {
    const item: CitationSelectionItem = { ...SOURCE, locatorTerm: "page" };
    expect(buildCitationMarkdown([item])).toBe("[@z:u:7XK2PQ9M]");
  });

  it("trims whitespace-only prefix, suffix and locator value", () => {
    const item: CitationSelectionItem = {
      ...SOURCE,
      prefix: "  ",
      suffix: "  ",
      locatorTerm: "page",
      locatorValue: "  ",
    };
    expect(buildCitationMarkdown([item])).toBe("[@z:u:7XK2PQ9M]");
  });

  it("joins multiple selected items with a semicolon (spec 5.7)", () => {
    const first: CitationSelectionItem = {
      ...SOURCE,
      prefix: "see",
      locatorTerm: "figure",
      locatorValue: "2",
    };
    const second: CitationSelectionItem = {
      ...OTHER,
      locatorTerm: "page",
      locatorValue: "10-12",
    };
    expect(buildCitationMarkdown([first, second])).toBe(
      "[see @z:u:7XK2PQ9M, figure 2; @z:u:9HJ3LM2N, page 10-12]",
    );
  });
});
