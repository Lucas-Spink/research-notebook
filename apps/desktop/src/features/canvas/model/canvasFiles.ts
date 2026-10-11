import {
  CANVAS_FORMAT_VERSION,
  type CanvasFileModel,
} from "@research-notebook/format";

const CANVAS_DIR = "_notebook/canvases";
const CANVAS_SUFFIX = ".canvas.json";

/** The project-relative path of the canvas with this id (format-v1.md 4.9). */
export function canvasPath(id: string): string {
  return `${CANVAS_DIR}/${id}${CANVAS_SUFFIX}`;
}

/** The project-relative path of a canvas file listed by name. */
export function canvasPathOfFile(fileName: string): string {
  return `${CANVAS_DIR}/${fileName}`;
}

/** A new, empty canvas. Presentation only: it holds no text and no results. */
export function newCanvasFile(id: string, name: string): CanvasFileModel {
  return {
    format_version: CANVAS_FORMAT_VERSION,
    id,
    name,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export type NameProblem = "empty" | "unsuitable";

// C0 controls, DEL and the Unicode line and paragraph separators: what the
// format's single-line text type refuses.
function isUnsuitable(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f || code === 0x2028 || code === 0x2029)
      return true;
  }
  return false;
}

/** A canvas name as the person typed it, or why it cannot be used. */
export function canvasName(
  raw: string,
): { ok: true; value: string } | { ok: false; error: NameProblem } {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: "empty" };
  if (isUnsuitable(name)) return { ok: false, error: "unsuitable" };
  return { ok: true, value: name };
}

const DEFAULT_NAME = "Untitled canvas";

/** "Untitled canvas", or the first "Untitled canvas N" not already used. */
export function defaultCanvasName(existing: readonly string[]): string {
  const used = new Set(existing.map((name) => name.toLowerCase()));
  if (!used.has(DEFAULT_NAME.toLowerCase())) return DEFAULT_NAME;
  for (let n = 2; ; n += 1) {
    const candidate = `${DEFAULT_NAME} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** The canvas with another name; everything else, unknown keys included, is kept. */
export function renamed(file: CanvasFileModel, name: string): CanvasFileModel {
  return { ...file, name };
}

/**
 * By name, ignoring case, then by file name. A canvas that could not be read
 * has no name and is placed by its file name.
 */
export function sortEntries<
  T extends { fileName: string; name: string | null },
>(entries: readonly T[]): T[] {
  const key = (entry: T) => (entry.name ?? entry.fileName).toLowerCase();
  return [...entries].sort(
    (a, b) =>
      key(a).localeCompare(key(b)) || a.fileName.localeCompare(b.fileName),
  );
}
