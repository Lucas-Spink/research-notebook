/** Where `/cite` was typed: the range to take out before the picker opens. */
export type CiteTrigger = { start: number; end: number };

const TRIGGER = "/cite";

/**
 * Whether the caret is just after `/cite` typed as a word of its own (the
 * slash command of the section editors): at the start of the note or after
 * whitespace, and nothing typed after it.
 */
export function citeTrigger(text: string, caret: number): CiteTrigger | null {
  const start = caret - TRIGGER.length;
  if (start < 0 || text.slice(start, caret) !== TRIGGER) return null;
  const before = start === 0 ? "" : (text[start - 1] ?? "");
  return before === "" || /\s/.test(before) ? { start, end: caret } : null;
}

/** `text` with `markdown` put in at `at`, and where the caret goes after it. */
export function spliceCitation(
  text: string,
  at: number,
  markdown: string,
): { text: string; caret: number } {
  const place = Math.min(Math.max(0, at), text.length);
  return {
    text: `${text.slice(0, place)}${markdown}${text.slice(place)}`,
    caret: place + markdown.length,
  };
}

// A bracketed Pandoc citation (format-v1.md 7.2) with at least one citekey.
const CLUSTER = /\[[^\][]*@z:(?:u|g\d+):[2-9A-Z]{8}[^\][]*\]/g;
const KEY = /(-?)@(z:(?:u|g\d+):[2-9A-Z]{8})/g;

/**
 * Text with each citation shown by its sources' short labels (author and
 * year) instead of their keys, for reading. The note itself keeps the key. A
 * source that is not cached keeps its key.
 */
export function readableCitations(
  text: string,
  label: (citekey: string) => string | null,
): string {
  return text.replace(CLUSTER, (cluster) =>
    cluster.replace(KEY, (whole, dash: string, key: string) => {
      const name = label(key);
      return name === null ? whole : `${dash}${name}`;
    }),
  );
}
