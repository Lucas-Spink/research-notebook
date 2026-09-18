const BYTE_ORDER_MARK = "﻿";

/**
 * Normalises text read from disk (format-v1.md 3.1): a leading BOM is
 * dropped and CRLF becomes LF. The result is what every parser works on, so
 * a file written by another tool becomes canonical the next time it is
 * written.
 */
export function normaliseText(input: string): string {
  const withoutBom = input.startsWith(BYTE_ORDER_MARK) ? input.slice(1) : input;
  return withoutBom.replace(/\r\n/g, "\n");
}

const BLANK_LINE = /^[ \t]*$/;

/** True for an empty line or one holding only spaces and tabs. */
export function isBlankLine(line: string): boolean {
  return BLANK_LINE.test(line);
}

/**
 * Removes blank lines from both ends and keeps everything between them
 * exactly as written, including trailing spaces (Markdown hard breaks) and
 * blank lines in the middle.
 */
export function trimBlankLines(text: string): string {
  const lines = text.split("\n");
  let start = 0;
  let end = lines.length;
  while (start < end && isBlankLine(lines[start] ?? "")) start += 1;
  while (end > start && isBlankLine(lines[end - 1] ?? "")) end -= 1;
  return lines.slice(start, end).join("\n");
}
