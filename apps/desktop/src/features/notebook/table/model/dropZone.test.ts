import { describe, expect, it } from "vitest";
import { pointerInZone } from "./dropZone";

const zone = { left: 100, top: 50, right: 500, bottom: 250 };

describe("pointerInZone", () => {
  it("is true inside and on the edge, and false outside", () => {
    expect(pointerInZone(300, 150, 1, zone)).toBe(true);
    expect(pointerInZone(100, 50, 1, zone)).toBe(true);
    expect(pointerInZone(500, 250, 1, zone)).toBe(true);
    expect(pointerInZone(99, 150, 1, zone)).toBe(false);
    expect(pointerInZone(300, 251, 1, zone)).toBe(false);
  });

  it("turns physical pixels into CSS pixels first", () => {
    // 1.5 scaling: the window says 450 physical, which is 300 CSS pixels.
    expect(pointerInZone(450, 225, 1.5, zone)).toBe(true);
    expect(pointerInZone(450, 450, 1.5, zone)).toBe(false);
  });

  it("never places a position that could not be carried, or a bad ratio", () => {
    expect(pointerInZone(null, 150, 1, zone)).toBe(false);
    expect(pointerInZone(300, null, 1, zone)).toBe(false);
    expect(pointerInZone(300, 150, 0, zone)).toBe(false);
    expect(pointerInZone(300, 150, Number.NaN, zone)).toBe(false);
  });
});
