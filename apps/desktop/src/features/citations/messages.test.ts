import { describe, expect, it } from "vitest";
import type { ZoteroState } from "./model/status";
import { zoteroStatusText } from "./messages";

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
