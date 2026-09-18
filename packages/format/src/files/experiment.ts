import type {
  ExperimentBodyModel,
  ExperimentFrontmatterModel,
} from "../schema";
import { fail, type FormatError, type Result } from "../result";

/** A parsed `experiments/<ref>/experiment.md`. */
export interface ExperimentFile {
  frontmatter: ExperimentFrontmatterModel;
  body: ExperimentBodyModel;
}

/** Parses an experiment file. */
export function parseExperiment(
  _text: string,
): Result<ExperimentFile, FormatError> {
  void _text;
  return fail({ kind: "frontmatter", message: "not implemented" });
}

/** Writes an experiment file in canonical form. */
export function serialiseExperiment(_experiment: ExperimentFile): string {
  void _experiment;
  throw new Error("not implemented");
}
