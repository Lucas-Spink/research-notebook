import { assertNever } from "./assert-never";
import { fail, ok, type FormatError, type Result } from "./result";
import type { ExperimentBodyModel } from "./schema";
import { isBlankLine, trimBlankLines } from "./text";

type Section = ExperimentBodyModel["sections"][number];
type RecognisedKey = Exclude<Section["key"], "unknown">;

const LITERATURE_START = "<!-- literature:start -->";
const LITERATURE_END = "<!-- literature:end -->";

/** Recognised headings, matched after trimming and lower-casing (spec 5.5). */
const RECOGNISED: ReadonlyMap<string, RecognisedKey> = new Map([
  ["methods", "methods"],
  ["results notes", "results_notes"],
  ["interpretation", "interpretation"],
]);

function canonicalHeading(key: RecognisedKey): string {
  switch (key) {
    case "methods":
      return "Methods";
    case "results_notes":
      return "Results notes";
    case "interpretation":
      return "Interpretation";
    default:
      return assertNever(key);
  }
}

interface Fence {
  readonly char: string;
  readonly length: number;
}

// CommonMark: up to three spaces of indentation, three or more of one character.
const OPENING_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

function openingFence(line: string): Fence | null {
  const match = OPENING_FENCE.exec(line);
  const marker = match?.[1];
  if (marker === undefined) return null;
  // A backtick fence's info string may not contain a backtick.
  if (marker.startsWith("`") && (match?.[2] ?? "").includes("`")) return null;
  return { char: marker.charAt(0), length: marker.length };
}

function closesFence(line: string, fence: Fence): boolean {
  const marker = CLOSING_FENCE.exec(line)?.[1];
  return (
    marker !== undefined &&
    marker.startsWith(fence.char) &&
    marker.length >= fence.length
  );
}

interface Draft {
  key: Section["key"];
  heading: string;
  lines: string[];
}

function bodyError(message: string, index: number): FormatError {
  return { kind: "body", message, line: index + 1 };
}

/**
 * Parses the Markdown after an experiment's frontmatter (format-v1.md 4.3).
 * `text` has already been normalised to LF. Only level-2 headings and the
 * literature markers are interpreted, and never inside a fenced code block;
 * everything else is kept as written.
 */
export function parseExperimentBody(
  text: string,
): Result<ExperimentBodyModel, FormatError> {
  const lines = text.split("\n");
  const preamble: string[] = [];
  const drafts: Draft[] = [];
  const seen = new Set<RecognisedKey>();
  let literature: string[] | null = null;
  let current = preamble;
  let fence: Fence | null = null;
  let phase: "body" | "literature" | "after" = "body";

  for (const [index, line] of lines.entries()) {
    if (phase === "after") {
      if (isBlankLine(line)) continue;
      return fail(bodyError("text after the literature end marker", index));
    }
    if (fence !== null) {
      if (closesFence(line, fence)) fence = null;
      current.push(line);
      continue;
    }
    const opened = openingFence(line);
    if (opened !== null) {
      fence = opened;
      current.push(line);
      continue;
    }
    if (line === LITERATURE_START) {
      if (phase === "literature") {
        return fail(
          bodyError("literature start marker inside a literature block", index),
        );
      }
      literature = [];
      current = literature;
      phase = "literature";
      continue;
    }
    if (line === LITERATURE_END) {
      if (phase !== "literature") {
        return fail(
          bodyError("literature end marker without a start marker", index),
        );
      }
      phase = "after";
      continue;
    }
    const heading = phase === "body" ? /^## (.*)$/.exec(line)?.[1] : undefined;
    if (heading !== undefined) {
      const key = RECOGNISED.get(heading.trim().toLowerCase());
      if (key !== undefined && seen.has(key)) {
        return fail(
          bodyError(
            `section "${canonicalHeading(key)}" appears more than once`,
            index,
          ),
        );
      }
      if (key !== undefined) seen.add(key);
      const draft: Draft = { key: key ?? "unknown", heading, lines: [] };
      drafts.push(draft);
      current = draft.lines;
      continue;
    }
    current.push(line);
  }

  if (phase === "literature") {
    return fail(
      bodyError(
        "literature start marker without an end marker",
        lines.length - 1,
      ),
    );
  }

  return ok({
    preamble: trimBlankLines(preamble.join("\n")),
    sections: drafts.map(finishSection),
    literature:
      literature === null ? null : trimBlankLines(literature.join("\n")),
  });
}

function finishSection(draft: Draft): Section {
  const body = trimBlankLines(draft.lines.join("\n"));
  return draft.key === "unknown"
    ? { key: "unknown", heading: draft.heading, body }
    : { key: draft.key, body };
}

/**
 * Writes the canonical body blocks, separated by one blank line and with no
 * final newline. Empty when there are no blocks.
 *
 * Precondition: the text of every block obeys the grammar (no level-2
 * heading or literature marker outside a fence, every fence closed).
 * Section text typed by a user must be checked before it is stored here.
 */
export function serialiseExperimentBody(body: ExperimentBodyModel): string {
  const blocks: string[] = [];
  if (body.preamble !== "") blocks.push(body.preamble);
  for (const section of body.sections) blocks.push(sectionBlock(section));
  if (body.literature !== null) blocks.push(literatureBlock(body.literature));
  return blocks.join("\n\n");
}

function sectionBlock(section: Section): string {
  const heading =
    section.key === "unknown" ? section.heading : canonicalHeading(section.key);
  return section.body === ""
    ? `## ${heading}`
    : `## ${heading}\n\n${section.body}`;
}

function literatureBlock(content: string): string {
  return content === ""
    ? `${LITERATURE_START}\n${LITERATURE_END}`
    : `${LITERATURE_START}\n${content}\n${LITERATURE_END}`;
}
