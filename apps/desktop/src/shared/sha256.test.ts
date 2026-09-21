import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

const reference = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

describe("sha256Hex", () => {
  it("matches the published test vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("hashes the UTF-8 bytes of non-ASCII text, as the file holds them", () => {
    for (const text of ["é", "日本語", "😀", "naïve — “quoted”", "a\r\nb\n"]) {
      expect(sha256Hex(text), text).toBe(reference(text));
    }
  });

  it("is right at every length around the block boundaries", () => {
    for (let length = 0; length <= 200; length += 1) {
      const text = "x".repeat(length);
      expect(sha256Hex(text), `${length}`).toBe(reference(text));
    }
  });

  it("hashes a long text", () => {
    const text = "0123456789\n".repeat(50_000);
    expect(sha256Hex(text)).toBe(reference(text));
  });
});
