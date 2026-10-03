import { Citekey } from "../schema";
import {
  CITATION_ANCHORED,
  CITATION_IN_TEXT_ANCHORED,
  CITATION_ITEM,
} from "./citation";

const FENCE = /^\s*(`{3,}|~{3,})/;

/** The part of a cluster item with its citekey swapped, or `null` when the item is not a citation. */
function rewriteItem(part: string, from: string, to: string): string | null {
  const match = CITATION_ITEM.exec(part.trim());
  const citekey = match?.[3];
  if (match === null || citekey === undefined) return null;
  if (!Citekey.safeParse(citekey).success) return null;
  if (citekey !== from) return part;
  const lead = part.length - part.trimStart().length;
  const at =
    lead + (match[1] ?? "").length + (match[2] === undefined ? 0 : 1) + 1;
  return part.slice(0, at) + to + part.slice(at + from.length);
}

/** A bracketed cluster as written with `from` swapped for `to`, or `null` when it is not a citation. */
function rewriteCluster(body: string, from: string, to: string): string | null {
  const parts = body.split(";").map((part) => rewriteItem(part, from, to));
  return parts.every((part) => part !== null) ? parts.join(";") : null;
}

/** The index just after the inline code span opening at `at`, or `at` plus its backticks when it never closes. */
export function skipCodeSpan(line: string, at: number): number {
  let run = 0;
  while (line[at + run] === "`") run += 1;
  let search = at + run;
  while (search < line.length) {
    const next = line.indexOf("`", search);
    if (next === -1) break;
    let closing = 0;
    while (line[next + closing] === "`") closing += 1;
    if (closing === run) return next + closing;
    search = next + closing;
  }
  return at + run;
}

function rewriteLine(line: string, from: string, to: string): string {
  let out = "";
  let at = 0;
  while (at < line.length) {
    const char = line[at];
    const rest = line.slice(at);
    if (char === "`") {
      const end = skipCodeSpan(line, at);
      out += line.slice(at, end);
      at = end;
      continue;
    }
    const cluster = char === "[" ? CITATION_ANCHORED.exec(rest) : null;
    const rewritten =
      cluster === null ? null : rewriteCluster(cluster[1] ?? "", from, to);
    if (cluster !== null && rewritten !== null) {
      out += `[${rewritten}]`;
      at += cluster[0].length;
      continue;
    }
    const inText = char === "@" ? CITATION_IN_TEXT_ANCHORED.exec(rest) : null;
    const citekey = inText?.[1];
    if (inText !== null && citekey !== undefined) {
      if (Citekey.safeParse(citekey).success) {
        const swapped = citekey === from ? to : citekey;
        out += `@${swapped}${inText[0].slice(1 + citekey.length)}`;
        at += inText[0].length;
        continue;
      }
    }
    out += char;
    at += 1;
  }
  return out;
}

/**
 * `text` with `rewriteLine` applied to every line of prose, leaving lines
 * inside code fences as they are, as the editor does not treat them as
 * citations.
 */
export function mapProseLines(
  text: string,
  rewriteProse: (line: string) => string,
): string {
  let fence: string | null = null;
  return text
    .split("\n")
    .map((line) => {
      const marker = FENCE.exec(line)?.[1];
      if (fence !== null) {
        const closes =
          marker !== undefined &&
          marker[0] === fence[0] &&
          marker.length >= fence.length &&
          line.trim() === marker;
        if (closes) fence = null;
        return line;
      }
      if (marker !== undefined) {
        fence = marker;
        return line;
      }
      return rewriteProse(line);
    })
    .join("\n");
}

/**
 * `text` with every citation of `from` pointing at `to` instead (FR-CIT-08),
 * and nothing else changed: prefix, locator, suffix, the suppress-author form,
 * hand-written author-in-text forms and every other byte are kept. Citations
 * inside code fences and inline code are left alone, as the editor does not
 * treat them as citations. Uses the same patterns and `Citekey` check as the
 * section editor, so both agree on what a citation is.
 */
export function replaceCitekey(text: string, from: string, to: string): string {
  if (from === to || text === "") return text;
  return mapProseLines(text, (line) => rewriteLine(line, from, to));
}
