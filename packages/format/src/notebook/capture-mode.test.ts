import { describe, expect, it } from "vitest";
import { decideCaptureMode } from "../index";

const MB = 1024 * 1024;

describe("decideCaptureMode (FR-EVD-02)", () => {
  it("copies a file below the threshold", () => {
    expect(decideCaptureMode(50 * MB, 100)).toBe("copy");
  });

  it("copies a file exactly at the threshold", () => {
    expect(decideCaptureMode(100 * MB, 100)).toBe("copy");
  });

  it("links a file above the threshold", () => {
    expect(decideCaptureMode(100 * MB + 1, 100)).toBe("link");
  });

  it("links every file, however small, when the threshold is 0", () => {
    expect(decideCaptureMode(0, 0)).toBe("link");
    expect(decideCaptureMode(1, 0)).toBe("link");
  });

  it("lets a per-capture override decide regardless of size", () => {
    expect(decideCaptureMode(1, 100, "link")).toBe("link");
    expect(decideCaptureMode(1_000 * MB, 100, "copy")).toBe("copy");
  });
});
