import { describe, expect, it } from "vitest";
import type { CitationSearchState } from "./model/citationSearch";
import type { LocatorTerm } from "./model/citationSelection";
import type { ZoteroState } from "./model/status";
import {
  citationSearchStatusText,
  locatorTermLabel,
  zoteroStatusText,
} from "./messages";

describe("zoteroStatusText", () => {
  // One of every state: a new state without text fails to compile.
  const states: ZoteroState[] = [
    { kind: "connected" },
    { kind: "disabled" },
    { kind: "notRunning" },
    { kind: "unknown" },
  ];

  it("gives every state a label", () => {
    for (const state of states) {
      expect(zoteroStatusText(state).label.length, state.kind).toBeGreaterThan(
        0,
      );
    }
  });

  it("offers no guidance once connected", () => {
    expect(zoteroStatusText({ kind: "connected" }).guidance).toBeNull();
  });

  it("offers guidance for every state that is not connected", () => {
    for (const state of states.filter((s) => s.kind !== "connected")) {
      expect(
        zoteroStatusText(state).guidance?.length ?? 0,
        state.kind,
      ).toBeGreaterThan(0);
    }
  });

  it("points at the local API setting when disabled", () => {
    const { guidance } = zoteroStatusText({ kind: "disabled" });
    expect(guidance).toMatch(/Settings.*Advanced/);
    expect(guidance).toMatch(/local API|communicate with Zotero/);
  });
});

describe("citationSearchStatusText", () => {
  // Every non-"ok" state: a new one without text fails to compile.
  const states: Exclude<CitationSearchState, { kind: "ok" }>[] = [
    { kind: "idle" },
    { kind: "loading" },
    { kind: "notRunning" },
    { kind: "disabled" },
    { kind: "error" },
  ];

  it("gives every non-result state some text", () => {
    for (const state of states) {
      expect(
        citationSearchStatusText(state).length,
        state.kind,
      ).toBeGreaterThan(0);
    }
  });

  it("matches the status indicator's wording for notRunning and disabled", () => {
    expect(citationSearchStatusText({ kind: "notRunning" })).toBe(
      zoteroStatusText({ kind: "notRunning" }).label,
    );
    expect(citationSearchStatusText({ kind: "disabled" })).toBe(
      zoteroStatusText({ kind: "disabled" }).label,
    );
  });
});

describe("locatorTermLabel", () => {
  const terms: LocatorTerm[] = [
    "page",
    "chapter",
    "figure",
    "section",
    "table",
    "supplement",
  ];

  it("capitalises every locator term", () => {
    expect(terms.map(locatorTermLabel)).toEqual([
      "Page",
      "Chapter",
      "Figure",
      "Section",
      "Table",
      "Supplement",
    ]);
  });

  it("labels no locator as None", () => {
    expect(locatorTermLabel(null)).toBe("None");
  });
});
