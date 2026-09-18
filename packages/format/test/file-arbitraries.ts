import fc from "fast-check";
import {
  COLUMN_KEYS,
  ExperimentBody,
  ExperimentFrontmatter,
  ProjectYaml,
  QuestionFrontmatter,
} from "../src/schema";
import { relativePathSegments, timestamp, ulid } from "./arbitraries";

/**
 * Generators for whole notebook files (S2-T02). They finish with a Zod
 * parse, so the generators themselves are checked against the schemas and
 * every value handed to a test is a correctly typed, valid model.
 *
 * Shared primitives (ulid, timestamp, sha256, paths) come from
 * `arbitraries.ts`; this module is separate only to stay under the file-size
 * guideline.
 */

// Characters chosen to stress YAML and JSON quoting: quotes, backslash,
// colon, hash, flow and block indicators, and non-ASCII (NFC) text.
const TEXT_CHARS = [..."abcXYZ019 .,:;#'\"\\-_{}[]()%@&*!?|>/éü日本\u{1f600}"];

/** Single-line text with no control characters (the schema's `text` type). */
export function text(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...TEXT_CHARS), { minLength: 1, maxLength: 24 })
    .map((chars) => chars.join(""));
}

const UNKNOWN_KEYS = ["x_a", "x_b", "x_c", "x_note", "x_extra"] as const;

// Strings that YAML would read as other types if they were not quoted.
const LOOKALIKES = ["true", "null", "1.5", "2026-01-01", "~", "", "0x1F"];

function unknownScalar(): fc.Arbitrary<unknown> {
  return fc.oneof(
    text(),
    fc.constantFrom(...LOOKALIKES),
    fc.array(text(), { minLength: 2, maxLength: 3 }).map((a) => a.join("\n")),
    fc.integer({ min: -1_000_000, max: 1_000_000 }),
    fc.boolean(),
    fc.constant(null),
  );
}

function unknownValue(): fc.Arbitrary<unknown> {
  return fc.letrec<{ value: unknown }>((tie) => ({
    value: fc.oneof(
      { maxDepth: 3, depthIdentifier: "unknown-value" },
      unknownScalar(),
      fc.array(tie("value"), { maxLength: 3 }),
      fc.dictionary(fc.constantFrom(...UNKNOWN_KEYS), tie("value"), {
        maxKeys: 3,
      }),
    ),
  })).value;
}

/** Keys the format does not know, which every level must carry through. */
export function unknownFields(): fc.Arbitrary<Record<string, unknown>> {
  return fc.dictionary(fc.constantFrom(...UNKNOWN_KEYS), unknownValue(), {
    maxKeys: 2,
  });
}

/** Adds unknown keys after the known ones, as the canonical writer does. */
export function withUnknown<T extends Record<string, unknown>>(
  known: fc.Arbitrary<T>,
): fc.Arbitrary<Record<string, unknown>> {
  return fc
    .tuple(known, unknownFields())
    .map(([fields, extra]) => ({ ...fields, ...extra }));
}

function semver(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.nat(20),
      fc.nat(20),
      fc.nat(20),
      fc.constantFrom("", "-rc.1", "+build.7"),
    )
    .map(([a, b, c, suffix]) => `${a}.${b}.${c}${suffix}`);
}

function isoDate(): fc.Arbitrary<string> {
  return timestamp().map((value) => value.slice(0, 10));
}

export function pathText(): fc.Arbitrary<string> {
  return relativePathSegments().map((segments) => segments.join("/"));
}

export function fileName(): fc.Arbitrary<string> {
  return relativePathSegments().map((segments) => segments.join("-"));
}

function refNumber(): fc.Arbitrary<string> {
  return fc
    .integer({ min: 1, max: 9999 })
    .map((n) => String(n).padStart(3, "0"));
}

const ULID_POOL_SIZE = 12;

export function ulidPool(size: number): fc.Arbitrary<string[]> {
  return fc.uniqueArray(ulid(), { minLength: size, maxLength: size });
}

/** project.yaml (spec 5.3) with unknown keys at every level. */
export function projectModel(): fc.Arbitrary<
  ReturnType<typeof ProjectYaml.parse>
> {
  const order = fc
    .tuple(ulidPool(ULID_POOL_SIZE), fc.array(fc.nat(3), { maxLength: 3 }))
    .chain(([pool, counts]) => {
      let next = 0;
      const entries = counts.map((count) => {
        const question = pool[next++] ?? "";
        const experiments = pool.slice(next, next + count);
        next += count;
        return { question, experiments };
      });
      return fc.tuple(
        ...entries.map((entry) => withUnknown(fc.constant(entry))),
      );
    });
  const columns = fc
    .tuple(
      fc.shuffledSubarray([...COLUMN_KEYS], { minLength: 6, maxLength: 6 }),
      fc.array(fc.integer({ min: 1, max: 2000 }), {
        minLength: 6,
        maxLength: 6,
      }),
      fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
      fc.array(unknownFields(), { minLength: 6, maxLength: 6 }),
    )
    .map(([keys, widths, hidden, extra]) =>
      keys.map((key, i) => ({
        key,
        width: widths[i],
        hidden: hidden[i],
        ...extra[i],
      })),
    );
  const roots = fc
    .uniqueArray(ulid(), { maxLength: 3 })
    .chain((ids) =>
      fc.tuple(
        ...ids.map((id) =>
          withUnknown(fc.record({ id: fc.constant(id), label: text() })),
        ),
      ),
    );
  return fc
    .record({
      format_version: fc.constant(1),
      id: ulid(),
      name: text(),
      created: timestamp(),
      last_written_by: semver(),
      archived: fc.option(timestamp(), { nil: null }),
      locale: fc.constantFrom("en-GB", "en-US", "fr", "de-CH", "sr-Latn-RS"),
      citation_style: fileName().map((name) => `${name}.csl`),
      capture: withUnknown(
        fc.record({
          copy_threshold_mb: fc.nat(5000),
          evidence_in_git: fc.boolean(),
        }),
      ),
      numbering: withUnknown(
        fc.record({
          next_question: fc.integer({ min: 1, max: 5000 }),
          next_experiment: fc.integer({ min: 1, max: 5000 }),
        }),
      ),
      order,
      table: withUnknown(
        fc.record({
          columns,
          collapsed_questions: fc.array(ulid(), { maxLength: 3 }),
        }),
      ),
      external_roots: roots,
    })
    .chain((project) => withUnknown(fc.constant(project)))
    .map((project) => ProjectYaml.parse(project));
}

/** The Markdown body of a question: any trimmed text (section 4.2). */
const LINE_CHARS = [..."abcdefghijXYZ0123456789 .,;:!?-*_#>[]()@'\"é日"];

function textLine(allowHeadings: boolean): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...LINE_CHARS), { maxLength: 30 })
    .map((chars) => chars.join(""))
    .filter((line) => allowHeadings || !line.startsWith("## "));
}

// Lines that look like headings or markers but sit inside a closed fence.
const FENCE_TRAPS = [
  "## Methods",
  "## methods",
  "## Unknown",
  "<!-- literature:start -->",
  "<!-- literature:end -->",
  "",
  "plain",
];

function fencedBlock(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom("```", "~~~", "````", "~~~~~"),
      fc.constantFrom("", " ", "  ", "   "),
      fc.array(fc.constantFrom(...FENCE_TRAPS), { maxLength: 4 }),
    )
    .map(([fence, indent, inner]) => {
      // A fence of the other character may appear inside without closing it.
      const other = fence.startsWith("`") ? "~~~" : "```";
      return [`${indent}${fence}`, ...inner, other, `${indent}${fence}`].join(
        "\n",
      );
    });
}

/** Removes leading and trailing blank lines, as the format's models do. */
export function trimBlankLines(value: string): string {
  const lines = value.split("\n");
  const blank = (line: string): boolean => /^[ \t]*$/.test(line);
  while (lines.length > 0 && blank(lines[0] ?? "")) lines.shift();
  while (lines.length > 0 && blank(lines[lines.length - 1] ?? "")) lines.pop();
  return lines.join("\n");
}

/** Markdown text that obeys the body grammar and is already trimmed. */
export function markdownText(allowHeadings = false): fc.Arbitrary<string> {
  return fc
    .array(
      fc.oneof(
        { weight: 6, arbitrary: textLine(allowHeadings) },
        { weight: 1, arbitrary: fencedBlock() },
        { weight: 1, arbitrary: fc.constant("") },
      ),
      { maxLength: 6 },
    )
    .map((parts) => trimBlankLines(parts.join("\n")));
}

/** question file: frontmatter plus a trimmed Motivation. */
export function questionFile(): fc.Arbitrary<{
  frontmatter: ReturnType<typeof QuestionFrontmatter.parse>;
  body: string;
}> {
  return fc.record({
    frontmatter: withUnknown(
      fc.record({
        id: ulid(),
        ref: refNumber().map((n) => `Q-${n}`),
        title: text(),
        created: timestamp(),
      }),
    ).map((value) => QuestionFrontmatter.parse(value)),
    body: markdownText(true),
  });
}

const RECOGNISED = ["methods", "results_notes", "interpretation"] as const;

// Compared after trim and case folding by the parser, so none may collide.
const UNKNOWN_HEADINGS = [
  "Notes",
  "Appendix A",
  "Related Work ##",
  "methods extra",
  "Literature",
  " padded",
  "Ends with space ",
  "",
];

export function experimentBody(): fc.Arbitrary<
  ReturnType<typeof ExperimentBody.parse>
> {
  const section = fc.oneof(
    fc.record({ key: fc.constantFrom(...RECOGNISED), body: markdownText() }),
    fc.record({
      key: fc.constant("unknown" as const),
      heading: fc.constantFrom(...UNKNOWN_HEADINGS),
      body: markdownText(),
    }),
  );
  return fc
    .record({
      preamble: markdownText(),
      sections: fc.array(section, { maxLength: 6 }).map((items) => {
        const seen = new Set<string>();
        return items.filter((item) => {
          if (item.key === "unknown") return true;
          if (seen.has(item.key)) return false;
          seen.add(item.key);
          return true;
        });
      }),
      literature: fc.option(
        fc
          .tuple(fc.boolean(), markdownText(true))
          .map(([withHeading, rest]) =>
            trimBlankLines(withHeading ? `## Literature\n\n${rest}` : rest),
          ),
        { nil: null },
      ),
    })
    .map((body) => ExperimentBody.parse(body));
}

export function experimentFile(): fc.Arbitrary<{
  frontmatter: ReturnType<typeof ExperimentFrontmatter.parse>;
  body: ReturnType<typeof ExperimentBody.parse>;
}> {
  const frontmatter = withUnknown(
    fc.record(
      {
        id: ulid(),
        ref: refNumber().map((n) => `EXP-${n}`),
        question: ulid(),
        title: text(),
        status: fc.constantFrom("planned", "running", "complete", "abandoned"),
        started: isoDate(),
        completed: isoDate(),
        created: timestamp(),
        updated: timestamp(),
      },
      {
        requiredKeys: [
          "id",
          "ref",
          "question",
          "title",
          "status",
          "created",
          "updated",
        ],
      },
    ),
  ).map((value) => ExperimentFrontmatter.parse(value));
  return fc.record({ frontmatter, body: experimentBody() });
}
