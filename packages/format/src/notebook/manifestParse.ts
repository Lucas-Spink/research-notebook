import { fail, ok, type Result } from "../result";
import type { Arranged } from "./arrange";
import { versionFilesOf } from "./integrity";

/** What Verify needs from one line of `manifest.csv` (FR-ARC-03). */
export interface ManifestEntry {
  /** Project-relative, beginning `_notebook/`. */
  path: string;
  size: number;
  /** Lower-case hexadecimal SHA-256. */
  sha256: string;
}

/** Why `manifest.csv` could not be read; `line` counts from 1, the header being line 1. */
export interface ManifestParseError {
  line: number;
  reason:
    "header" | "cells" | "quote" | "size" | "sha256" | "path" | "duplicate";
}

const HEADER = ["path", "size", "modified", "sha256", "experiments", "groups"];
const SHA256 = /^[0-9a-f]{64}$/;
const VERSION_FILE = /^_notebook\/experiments\/[^/]+\/(?:evidence|methods)\/.+/;

/** RFC 4180 records. `null` if a quoted cell is never closed or a quote is misplaced. */
function records(text: string): { cells: string[]; line: number }[] | null {
  const out: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let atCellStart = true;
  let line = 1;
  let startLine = 1;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charAt(i);
    if (quoted) {
      if (c === '"' && text.charAt(i + 1) === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        if (c === "\n") line += 1;
        cell += c;
      }
    } else if (c === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
    } else if (c === '"') {
      return null;
    } else if (c === ",") {
      cells.push(cell);
      cell = "";
      atCellStart = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text.charAt(i + 1) === "\n") i += 1;
      cells.push(cell);
      out.push({ cells, line: startLine });
      cells = [];
      cell = "";
      atCellStart = true;
      line += 1;
      startLine = line;
    } else {
      cell += c;
      atCellStart = false;
    }
  }
  if (quoted) return null;
  if (cell !== "" || cells.length > 0) {
    cells.push(cell);
    out.push({ cells, line: startLine });
  }
  return out;
}

/**
 * Reads `exports/manifest.csv` as `buildManifest` wrote it (FR-ARC-03). Strict:
 * a manifest that cannot be read exactly is an error, never a shorter list,
 * because Verify would then pass files it never checked.
 */
export function parseManifest(
  csv: string,
): Result<ManifestEntry[], ManifestParseError> {
  const rows = records(csv);
  if (rows === null) return fail({ line: 1, reason: "quote" });
  const [header, ...body] = rows;
  if (
    header === undefined ||
    header.cells.length !== HEADER.length ||
    header.cells.some((cell, index) => cell !== HEADER[index])
  ) {
    return fail({ line: 1, reason: "header" });
  }
  const entries: ManifestEntry[] = [];
  const seen = new Set<string>();
  for (const { cells, line } of body) {
    const [rawPath, rawSize, , sha256, ...rest] = cells;
    if (
      cells.length !== HEADER.length ||
      rawPath === undefined ||
      rawSize === undefined ||
      sha256 === undefined ||
      rest.length !== 2
    ) {
      return fail({ line, reason: "cells" });
    }
    // Paths begin `_notebook/`, so `manifestCell` never guards them.
    const path = rawPath;
    if (!VERSION_FILE.test(path)) return fail({ line, reason: "path" });
    if (!/^\d+$/.test(rawSize) || !Number.isSafeInteger(Number(rawSize))) {
      return fail({ line, reason: "size" });
    }
    if (!SHA256.test(sha256)) return fail({ line, reason: "sha256" });
    if (seen.has(path)) return fail({ line, reason: "duplicate" });
    seen.add(path);
    entries.push({ path, size: Number(rawSize), sha256 });
  }
  return ok(entries);
}

/**
 * Captured files the notebook records but the manifest does not list, so
 * Verify cannot vouch for them: files added after the manifest was made.
 */
export function unlistedFiles(
  arranged: Arranged,
  entries: readonly ManifestEntry[],
): string[] {
  const listed = new Set(entries.map((entry) => entry.path));
  return versionFilesOf(arranged)
    .map((file) => file.path)
    .filter((path) => !listed.has(path))
    .sort();
}
