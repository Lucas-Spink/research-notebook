import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every source file is UTF-8 (AGENTS.md section 5). Vitest reads a file with a
 * stray Windows-1252 byte without complaint, but `vite build` refuses it, so
 * a bad byte used to surface only when the application was built.
 */

const SRC = __dirname;
const EXTENSIONS = [".ts", ".tsx", ".css", ".json", ".md"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ? [path]
      : [];
  });
}

describe("source encoding", () => {
  it("has no file in apps/desktop/src that is not valid UTF-8", () => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const invalid = sourceFiles(SRC).filter((path) => {
      try {
        decoder.decode(readFileSync(path));
        return false;
      } catch {
        return true;
      }
    });
    expect(invalid.map((path) => path.slice(SRC.length + 1))).toEqual([]);
  });
});
