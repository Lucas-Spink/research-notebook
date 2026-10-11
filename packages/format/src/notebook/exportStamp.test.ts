import { describe, expect, it } from "vitest";
import { exportInstant, exportStamp } from "./exportStamp";

describe("exportStamp (issue #102)", () => {
  it("writes the UTC instant to the second, safe in a file name", () => {
    expect(exportStamp(new Date("2026-10-11T14:30:05.789Z"))).toBe(
      "2026-10-11T14-30-05Z",
    );
  });

  it("says the same instant with colons for people to read", () => {
    expect(exportInstant(new Date("2026-10-11T14:30:05.789Z"))).toBe(
      "2026-10-11T14:30:05Z",
    );
  });

  it("sorts in time order and has no colon", () => {
    const earlier = exportStamp(new Date("2026-10-11T09:59:59Z"));
    const later = exportStamp(new Date("2026-10-11T10:00:00Z"));
    expect(earlier < later).toBe(true);
    expect(later).not.toContain(":");
  });
});
