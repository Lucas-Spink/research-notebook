import type { Token, TokenKind } from "./highlight";

export type Match = { line: number; start: number; length: number };
export type Range = { start: number; length: number };
/** A piece of a line; `range` is the index of the match it lies in, or `null`. */
export type Part = { kind: TokenKind; text: string; range: number | null };

/** Matches shown at most; past this the count reads "N+". */
export const MAX_MATCHES = 2000;

/**
 * Every place `query` occurs in `lines`, ignoring case, as plain text and
 * never as a pattern. Stops after `limit` so a very short query in a large
 * script cannot stall the page.
 */
export function findMatches(
  lines: readonly string[],
  query: string,
  limit: number = MAX_MATCHES,
): Match[] {
  if (query === "") return [];
  const needle = query.toLowerCase();
  const found: Match[] = [];
  for (const [line, text] of lines.entries()) {
    const haystack = text.toLowerCase();
    let from = 0;
    for (;;) {
      const start = haystack.indexOf(needle, from);
      if (start < 0) break;
      found.push({ line, start, length: needle.length });
      if (found.length >= limit) return found;
      from = start + needle.length;
    }
  }
  return found;
}

/**
 * Cuts a line's tokens at the edges of its matches so each piece is wholly
 * inside or outside one. The text is unchanged and the colours are kept.
 * `ranges` must be in order and not overlap, as [`findMatches`] gives them.
 */
export function splitByMatches(
  tokens: readonly Token[],
  ranges: readonly Range[],
): Part[] {
  const parts: Part[] = [];
  let offset = 0;
  let next = 0;
  for (const token of tokens) {
    let at = 0;
    while (at < token.text.length) {
      const range = ranges[next];
      const position = offset + at;
      if (range !== undefined && position >= range.start + range.length) {
        next += 1;
        continue;
      }
      const inside =
        range !== undefined &&
        position >= range.start &&
        position < range.start + range.length;
      const rangeIndex = inside ? next : null;
      const stop =
        range === undefined
          ? token.text.length
          : inside
            ? range.start + range.length - offset
            : range.start > position
              ? range.start - offset
              : token.text.length;
      const end = Math.min(token.text.length, stop);
      parts.push({
        kind: token.kind,
        text: token.text.slice(at, end),
        range: rangeIndex,
      });
      at = end;
    }
    offset += token.text.length;
  }
  return parts;
}
