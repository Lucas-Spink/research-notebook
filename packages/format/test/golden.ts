import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads a committed canonical file from `src/__golden__/`. Golden files are
 * opened read-only and never rewritten by tests; `pnpm golden:update` is the
 * only way they change (AGENTS.md section 8).
 */
export function readGolden(name: string): string {
  return readFileSync(join(__dirname, "../src/__golden__", name), "utf8");
}
