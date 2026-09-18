import {
  parseExperimentBody,
  serialiseExperimentBody,
} from "../experiment-body";
import { parseFrontmatterFile, writeFrontmatterFile } from "../frontmatter";
import { EXPERIMENT_SHAPE } from "../key-order";
import { ok, type FormatError, type Result } from "../result";
import {
  ExperimentFrontmatter,
  type ExperimentBodyModel,
  type ExperimentFrontmatterModel,
} from "../schema";

/** A parsed `experiments/<ref>/experiment.md`. */
export interface ExperimentFile {
  frontmatter: ExperimentFrontmatterModel;
  body: ExperimentBodyModel;
}

/** Parses an experiment file. */
export function parseExperiment(
  text: string,
): Result<ExperimentFile, FormatError> {
  const parsed = parseFrontmatterFile(text, ExperimentFrontmatter);
  if (!parsed.ok) return parsed;
  const body = parseExperimentBody(parsed.value.body);
  if (!body.ok) return body;
  return ok({ frontmatter: parsed.value.frontmatter, body: body.value });
}

/** Writes an experiment file in canonical form. */
export function serialiseExperiment(experiment: ExperimentFile): string {
  return writeFrontmatterFile(
    experiment.frontmatter,
    EXPERIMENT_SHAPE,
    serialiseExperimentBody(experiment.body),
  );
}
