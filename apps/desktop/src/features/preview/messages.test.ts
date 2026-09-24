import { describe, expect, it } from "vitest";
import { formatSize, previewMessages } from "./messages";

describe("previewMessages", () => {
  it("gives every failure its own readable sentence", () => {
    const texts = Object.values(previewMessages.failures);
    expect(new Set(texts).size).toBe(texts.length);
    for (const text of texts) expect(text).toMatch(/^[A-Z].*\.$/);
  });

  it("counts table rows and columns in words", () => {
    expect(previewMessages.table.dimensions(1, 1)).toBe("1 row, 1 column");
    expect(previewMessages.table.dimensions(12345, 3)).toBe(
      "12,345 rows, 3 columns",
    );
    expect(previewMessages.table.showing(200)).toBe(
      "Showing the first 200 rows.",
    );
  });
});

describe("formatSize", () => {
  it.each([
    [0, "0 bytes"],
    [1, "1 byte"],
    [999, "999 bytes"],
    [1000, "1.0 KB"],
    [1_536, "1.5 KB"],
    [250_000, "250 KB"],
    [20_000_000, "20 MB"],
    [2_147_483_648, "2.1 GB"],
  ])("%d bytes reads as %s", (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });
});
