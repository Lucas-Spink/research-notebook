import { z } from "zod";

/**
 * Primitive value schemas shared by every notebook file (spec 5.2). The
 * grammar of each is normative and documented in docs/format/format-v1.md.
 *
 * Error messages are diagnostics for the parser in S2-T02, which maps them
 * to typed errors; they are not user-facing text.
 */

/** The only format version this build reads and writes (spec 5.13). */
export const FORMAT_VERSION = 1;

export const FormatVersion = z.literal(FORMAT_VERSION);

/**
 * Reads only `format_version` so an opener can report a newer format as
 * read-only (spec 5.13 rule 2) before, and without, validating the rest of
 * a file whose shape it cannot know.
 */
export const FormatVersionProbe = z.looseObject({
  format_version: z.number().int().positive(),
});

// Crockford Base32 excludes I, L, O and U. The first character is at most 7
// so the 128-bit value does not overflow.
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/** Spec 5.2: ULID, 26 characters, Crockford Base32, uppercase. */
export const Ulid = z
  .string()
  .regex(ULID_PATTERN, "expected an uppercase Crockford Base32 ULID");

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

/** Spec 5.2: ISO 8601 calendar date, `YYYY-MM-DD`. */
export const IsoDate = z
  .string()
  .regex(DATE_PATTERN, "expected YYYY-MM-DD")
  .refine((text) => {
    const match = DATE_PATTERN.exec(text);
    return (
      match !== null &&
      isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
    );
  }, "not a real calendar date");

/**
 * Spec 5.2: RFC 3339 in UTC with `Z` and second precision. Fractions,
 * offsets and leap seconds are rejected so parse and serialise stay exact
 * inverses (decided in S2-T01).
 */
export const Timestamp = z
  .string()
  .regex(TIMESTAMP_PATTERN, "expected YYYY-MM-DDTHH:MM:SSZ")
  .refine((text) => {
    const match = TIMESTAMP_PATTERN.exec(text);
    if (match === null) return false;
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    return (
      isCalendarDate(year ?? 0, month ?? 0, day ?? 0) &&
      (hour ?? 99) <= 23 &&
      (minute ?? 99) <= 59 &&
      (second ?? 99) <= 59
    );
  }, "not a real UTC time");

/** Spec 5.8: lowercase hexadecimal SHA-256. */
export const Sha256 = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "expected 64 lowercase hexadecimal characters");

/** Spec 5.8: full Git commit object name. */
export const GitCommit = z
  .string()
  .regex(/^[0-9a-f]{40}$/, "expected 40 lowercase hexadecimal characters");

/** C0 controls, DEL and the Unicode line and paragraph separators. */
function hasControlCharacters(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f || code === 0x2028 || code === 0x2029)
      return true;
  }
  return false;
}

/** Single-line display text: names, titles, labels. Non-empty, no control characters. */
export const SingleLine = z
  .string()
  .min(1)
  .refine(
    (text) => !hasControlCharacters(text),
    "must be a single line without control characters",
  );

function relativePathProblem(path: string): string | null {
  if (path.length === 0) return "must not be empty";
  if (hasControlCharacters(path)) return "must not contain control characters";
  if (path.includes("\\")) return "must use forward slashes";
  if (path.startsWith("/")) return "must be relative";
  if (/^[A-Za-z]:/.test(path)) return "must not start with a drive letter";
  if (path.normalize("NFC") !== path) return "must be Unicode NFC";
  for (const segment of path.split("/")) {
    if (segment === "") return "must not contain empty segments";
    if (segment === "." || segment === "..")
      return "must not contain . or .. segments";
  }
  return null;
}

/**
 * Spec 5.2 and 9.3: relative, forward slashes, Unicode NFC, no `.` or `..`
 * segments, no drive letters. Resolution and containment are checked by
 * nb-fs, not here.
 */
export const RelativePath = z.string().superRefine((path, ctx) => {
  const problem = relativePathProblem(path);
  if (problem !== null) ctx.addIssue({ code: "custom", message: problem });
});

/** A repository root recorded relative to the project root; `.` is the project root itself. */
export const RepoPath = z.union([z.literal("."), RelativePath]);

/**
 * A single file name, never a path: no separators, not `.` or `..`, no
 * control characters, Unicode NFC. The Windows-safe naming rules of spec 9.2
 * apply to names the application creates and are enforced when writing.
 */
export const FileName = z.string().superRefine((name, ctx) => {
  const problem =
    name.includes("/") || name.includes("\\")
      ? "must not contain path separators"
      : name === "." || name === ".."
        ? "must not be . or .."
        : relativePathProblem(name);
  if (problem !== null) ctx.addIssue({ code: "custom", message: problem });
});

/** Spec 3: question label, `Q-###`; at least three digits, no extra leading zeros, never 0. */
export const QuestionRef = z
  .string()
  .regex(
    /^Q-(?:(?!000)\d{3}|[1-9]\d{3,})$/,
    "expected Q- followed by at least three digits",
  );

/** Spec 3: experiment label, `EXP-###`; same digit rules as questions. */
export const ExperimentRef = z
  .string()
  .regex(
    /^EXP-(?:(?!000)\d{3}|[1-9]\d{3,})$/,
    "expected EXP- followed by at least three digits",
  );

/** Spec 5.7: `u` for the user library, `g<digits>` for a group library. */
export const ZoteroLibrary = z
  .string()
  .regex(/^(?:u|g\d+)$/, "expected u or g<digits>");

/** Spec 5.7: Zotero item key, 8 characters from 2-9 and A-Z. */
export const ZoteroItemKey = z
  .string()
  .regex(/^[2-9A-Z]{8}$/, "expected an 8-character Zotero item key");

/** Spec 5.7: `z:<library>:<item-key>`. */
export const Citekey = z
  .string()
  .regex(/^z:(?:u|g\d+):[2-9A-Z]{8}$/, "expected z:<library>:<item-key>");

/** A non-negative whole number, used for sizes and thresholds. */
export const Count = z.number().int().nonnegative();

/** Spec 5.3 `last_written_by`, 5.11 `app_version`: a semantic version. */
export const AppVersion = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/,
    "expected a semantic version such as 0.4.2",
  );

/** Where an artefact's file was found: the project, or an external root by ULID (spec 5.8). */
export const SourceRoot = z.union([z.literal("project"), Ulid]);

/** Spec 5.8 `source` and 5.10 `source`. */
export const Source = z.looseObject({
  root: SourceRoot,
  path: RelativePath,
});

/** Spec 5.8 `provenance`, shared with inbox requests (spec 5.10). */
export const Provenance = z.looseObject({
  repo: RepoPath,
  commit: GitCommit,
  path_in_repo: RelativePath,
  file_dirty: z.boolean(),
  tree_dirty: z.boolean(),
});

export const ArtefactRole = z.enum(["result", "method"]);
export const ArtefactMode = z.enum(["copy", "link"]);
