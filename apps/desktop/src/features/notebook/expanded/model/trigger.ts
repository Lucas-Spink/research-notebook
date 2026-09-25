const OPENING_BRACKETS = new Set(["(", "[", "{"]);

/**
 * FR-EDT-04: typing `@` opens autocomplete only at the start of a line,
 * after whitespace, or after an opening bracket. `textBeforeTrigger` is the
 * current block's text up to (not including) the `@` itself; an empty
 * string means `@` is the first character of the block, the "start of a
 * line" case.
 */
export function allowsArtefactTrigger(textBeforeTrigger: string): boolean {
  if (textBeforeTrigger.length === 0) return true;
  const before = textBeforeTrigger.at(-1) ?? "";
  return /\s/.test(before) || OPENING_BRACKETS.has(before);
}
