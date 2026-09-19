import type { FormatError, Result } from "./result";
import type { ExperimentBodyModel } from "./schema";
import { RECOGNISED_SECTIONS } from "./schema";

/** A section the application recognises, in canonical order (spec 5.5). */
export type RecognisedSectionKey = (typeof RECOGNISED_SECTIONS)[number];

/** Stub: implemented after the failing tests are committed (S2-T03). */
export function setExperimentSection(
  body: ExperimentBodyModel,
  key: RecognisedSectionKey,
  text: string,
): Result<ExperimentBodyModel, FormatError> {
  throw new Error(
    `setExperimentSection is not implemented yet (${key}, ${text.length} characters, ${body.sections.length} sections)`,
  );
}
