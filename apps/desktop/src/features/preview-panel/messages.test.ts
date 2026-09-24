import { describe, expect, it } from "vitest";
import { panelMessages } from "./messages";

describe("panelMessages", () => {
  it("describes every availability outcome distinctly", () => {
    const texts = [
      panelMessages.availability.text({ kind: "available", size: 100 }),
      panelMessages.availability.text({ kind: "missing" }),
      panelMessages.availability.text({ kind: "rootUnresolved" }),
      panelMessages.availability.text({ kind: "rootFolderMissing" }),
    ];
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts[0]).toContain("100 bytes");
  });

  it("gives every open-action failure its own sentence", () => {
    const texts = Object.values(panelMessages.actionFailures);
    expect(new Set(texts).size).toBe(texts.length);
  });
});
