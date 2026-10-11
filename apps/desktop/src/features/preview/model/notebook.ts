/**
 * Reading a Jupyter notebook for display (issue #104). A notebook is
 * untrusted data: this only turns its saved JSON into plain values to show.
 * It never runs anything, and keeps no HTML, script or image bytes, so
 * nothing in a notebook can reach the page as markup.
 */

export type NotebookOutput =
  | {
      kind: "text";
      text: string;
      stream: "stdout" | "stderr" | null;
      cut: boolean;
    }
  | {
      kind: "error";
      name: string;
      value: string;
      traceback: string;
      cut: boolean;
    }
  | { kind: "image"; mime: string }
  | { kind: "html" }
  | { kind: "unsupported"; mime: string };

export type NotebookCell =
  | { kind: "markdown"; source: string }
  | { kind: "raw"; source: string }
  | {
      kind: "code";
      source: string;
      executionCount: number | null;
      outputs: NotebookOutput[];
    };

export type NotebookDoc = {
  cells: NotebookCell[];
  /** The language the notebook records, if any. */
  language: string | null;
};

/** Why a notebook cannot be shown as cells. */
export type NotebookProblem = "notJson" | "notNotebook" | "unsupportedVersion";

export type NotebookResult =
  { ok: true; value: NotebookDoc } | { ok: false; error: NotebookProblem };

/** Characters of one output kept; a notebook can save megabytes of text. */
export const MAX_OUTPUT_CHARS = 50_000;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/svg+xml"];
// Terminal colour and cursor sequences that tracebacks and streams contain.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** nbformat stores text as a string or as a list of lines. */
function multiline(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value.join("");
  }
  return null;
}

function clip(text: string): { text: string; cut: boolean } {
  const clean = text.replace(ANSI, "");
  return clean.length > MAX_OUTPUT_CHARS
    ? { text: clean.slice(0, MAX_OUTPUT_CHARS), cut: true }
    : { text: clean, cut: false };
}

function dataOutput(data: Json): NotebookOutput | null {
  // A saved image is noted, not loaded: the page's policy allows no data URLs.
  const image = IMAGE_TYPES.find((mime) => mime in data);
  if (image !== undefined) return { kind: "image", mime: image };
  const plain = multiline(data["text/plain"]);
  if (plain !== null) return { kind: "text", stream: null, ...clip(plain) };
  if ("text/html" in data) return { kind: "html" };
  const markdown = multiline(data["text/markdown"]);
  if (markdown !== null) {
    return { kind: "text", stream: null, ...clip(markdown) };
  }
  const mime = Object.keys(data)[0];
  return mime === undefined ? null : { kind: "unsupported", mime };
}

function parseOutput(raw: unknown): NotebookOutput | null | "invalid" {
  if (!isRecord(raw)) return "invalid";
  switch (raw["output_type"]) {
    case "stream": {
      const text = multiline(raw["text"]);
      if (text === null) return "invalid";
      return {
        kind: "text",
        stream: raw["name"] === "stderr" ? "stderr" : "stdout",
        ...clip(text),
      };
    }
    case "execute_result":
    case "display_data":
      return isRecord(raw["data"]) ? dataOutput(raw["data"]) : "invalid";
    case "error": {
      const lines = Array.isArray(raw["traceback"]) ? raw["traceback"] : [];
      const traceback = clip(
        lines.filter((line) => typeof line === "string").join("\n"),
      );
      return {
        kind: "error",
        name: typeof raw["ename"] === "string" ? raw["ename"] : "",
        value: typeof raw["evalue"] === "string" ? raw["evalue"] : "",
        traceback: traceback.text,
        cut: traceback.cut,
      };
    }
    default:
      return "invalid";
  }
}

function parseOutputs(raw: unknown): NotebookOutput[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const outputs: NotebookOutput[] = [];
  for (const item of raw) {
    const output = parseOutput(item);
    if (output === "invalid") return null;
    if (output !== null) outputs.push(output);
  }
  return outputs;
}

function parseCell(raw: unknown): NotebookCell | null {
  if (!isRecord(raw)) return null;
  const source = raw["source"] === undefined ? "" : multiline(raw["source"]);
  if (source === null) return null;
  switch (raw["cell_type"]) {
    case "markdown":
      return { kind: "markdown", source };
    case "raw":
      return { kind: "raw", source };
    case "code": {
      const outputs = parseOutputs(raw["outputs"]);
      if (outputs === null) return null;
      const count = raw["execution_count"];
      return {
        kind: "code",
        source,
        executionCount: typeof count === "number" ? count : null,
        outputs,
      };
    }
    default:
      return null;
  }
}

function languageOf(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  const info = metadata["language_info"];
  if (isRecord(info) && typeof info["name"] === "string") return info["name"];
  const spec = metadata["kernelspec"];
  if (isRecord(spec) && typeof spec["language"] === "string") {
    return spec["language"];
  }
  return null;
}

/**
 * Checks a notebook's text and turns it into cells to draw. Notebook format 4
 * is read; any other version is reported rather than guessed at.
 */
export function parseNotebook(text: string): NotebookResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "notJson" };
  }
  if (!isRecord(json)) return { ok: false, error: "notNotebook" };
  const version = json["nbformat"];
  if (typeof version !== "number") return { ok: false, error: "notNotebook" };
  if (version !== 4) return { ok: false, error: "unsupportedVersion" };
  const rawCells = json["cells"];
  if (!Array.isArray(rawCells)) return { ok: false, error: "notNotebook" };
  const cells: NotebookCell[] = [];
  for (const raw of rawCells) {
    const cell = parseCell(raw);
    if (cell === null) return { ok: false, error: "notNotebook" };
    cells.push(cell);
  }
  return { ok: true, value: { cells, language: languageOf(json["metadata"]) } };
}
