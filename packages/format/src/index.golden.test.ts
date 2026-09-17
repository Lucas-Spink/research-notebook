import { describe, expect, it } from "vitest";

describe("format package placeholder golden", () => {
  it("matches the committed golden output", async () => {
    await expect(
      "format package placeholder golden output\n",
    ).toMatchFileSnapshot("__golden__/placeholder.txt");
  });
});
