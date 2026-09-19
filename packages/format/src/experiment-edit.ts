import { parseExperimentBody } from "./experiment-body";
import { fail, ok, type FormatError, type Result } from "./result";
import { RECOGNISED_SECTIONS, type ExperimentBodyModel } from "./schema";
import { normaliseText, trimBlankLines } from "./text";

/** A section the application recognises, in canonical order (spec 5.5). */
export type RecognisedSectionKey = (typeof RECOGNISED_SECTIONS)[number];

type Section = ExperimentBodyModel["sections"][number];

const PROBE_HEADING = "Probe";

function bodyProblem(message: string, line?: number): FormatError {
  return line === undefined
    ? { kind: "body", message }
    : { kind: "body", message, line };
}

/**
 * Checks that `text` can be stored as one section's text: it must not contain
 * a level-2 heading or a literature marker outside a fence, and every fence
 * must close, or the saved file would read back as a different structure
 * (format-v1.md 4.3). Text already trimmed of edge blank lines.
 *
 * A heading appended after the text tells an unclosed fence apart: the
 * fence swallows it, so no section is found.
 */
function checkSectionText(text: string): FormatError | null {
  const probe = parseExperimentBody(`${text}\n## ${PROBE_HEADING}`);
  if (!probe.ok) {
    const line = probe.error.kind === "body" ? probe.error.line : undefined;
    return bodyProblem(
      `section text is not valid: ${probe.error.message}`,
      line,
    );
  }
  const { preamble, sections, literature } = probe.value;
  if (sections.length === 0) {
    return bodyProblem("section text leaves a code fence open");
  }
  if (literature !== null) {
    return bodyProblem("section text contains literature block markers");
  }
  if (sections.length > 1 || preamble !== text) {
    return bodyProblem("section text contains a level-2 heading");
  }
  return null;
}

/**
 * Where a recognised section that is missing goes (format-v1.md 4.3): after
 * the nearest preceding recognised section in canonical order, else before
 * the nearest following one, else after every other section.
 */
function insertionIndex(
  sections: readonly Section[],
  key: RecognisedSectionKey,
): number {
  const rank = RECOGNISED_SECTIONS.indexOf(key);
  const positionOf = (other: RecognisedSectionKey): number =>
    sections.findIndex((section) => section.key === other);

  for (const before of RECOGNISED_SECTIONS.slice(0, rank).reverse()) {
    const at = positionOf(before);
    if (at !== -1) return at + 1;
  }
  for (const after of RECOGNISED_SECTIONS.slice(rank + 1)) {
    const at = positionOf(after);
    if (at !== -1) return at;
  }
  return sections.length;
}

/**
 * Returns `body` with the text of one recognised section replaced. Everything
 * else is carried over untouched: the preamble, unknown sections, the order of
 * every section, and the literature block. A section that is missing is
 * created in canonical position (spec 5.5 rule 4).
 *
 * The text is normalised to LF and stripped of blank lines at either end. It
 * is rejected, and nothing changes, if it would break the body grammar, since
 * a saved file must read back as the same structure. `body` is not mutated.
 */
export function setExperimentSection(
  body: ExperimentBodyModel,
  key: RecognisedSectionKey,
  text: string,
): Result<ExperimentBodyModel, FormatError> {
  const normalised = trimBlankLines(normaliseText(text));
  const problem = checkSectionText(normalised);
  if (problem !== null) return fail(problem);

  const section: Section = { key, body: normalised };
  const existing = body.sections.findIndex((item) => item.key === key);
  if (existing !== -1) {
    return ok({
      ...body,
      sections: body.sections.map((item, index) =>
        index === existing ? section : item,
      ),
    });
  }
  const at = insertionIndex(body.sections, key);
  return ok({
    ...body,
    sections: [
      ...body.sections.slice(0, at),
      section,
      ...body.sections.slice(at),
    ],
  });
}
