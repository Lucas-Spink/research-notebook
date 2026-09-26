import type { ExperimentFile, QuestionFile } from "../files";
import type { ArtefactsFileModel, ProjectYamlModel } from "../schema";

/** The clock, identifier source and version a notebook operation is given, so tests are deterministic. */
export interface NotebookEnv {
  now: () => Date;
  newId: () => string;
  /** The running application's version, recorded in `project.yaml` as `last_written_by`. */
  appVersion: string;
}

/** A question file that was read: its name in `questions/`, and what it holds. */
export interface LoadedQuestion {
  /** For example `Q-001.md`. Normally the ref, but the ID is authoritative. */
  fileName: string;
  file: QuestionFile;
}

/** An experiment file that was read: its folder in `experiments/`, and what it holds. */
export interface LoadedExperiment {
  /** For example `EXP-001`. Normally the ref, but the ID is authoritative. */
  folder: string;
  file: ExperimentFile;
}

/**
 * An experiment's `artefacts.yaml` as it was read: what it holds, or that it
 * could not be read or parsed, in which case it is left untouched and that
 * experiment's evidence cannot be changed (AGENTS.md rule 5, ADR-0044).
 */
export type LoadedArtefacts =
  { kind: "file"; file: ArtefactsFileModel } | { kind: "unreadable" };

/**
 * Everything the questions-and-experiments operations need to know about an
 * open project, as `packages/format` parsed it. Operations never change one:
 * they return the next state in a [`Plan`].
 */
export interface NotebookState {
  project: ProjectYamlModel;
  /** In the order they were read (by file name), which decides which of two equal IDs came first. */
  questions: readonly LoadedQuestion[];
  experiments: readonly LoadedExperiment[];
  /**
   * Refs held by files and folders that could not be read, taken from their
   * names, so a new one is never given the same number (FR-EXP-03).
   */
  reservedRefs: readonly string[];
  /**
   * Project-relative paths of files that could not be read. They are left
   * untouched (AGENTS.md rule 5), and while there are any, entries in
   * `project.yaml` that name no known file are kept, because one may be theirs.
   */
  unreadable: readonly string[];
  /**
   * Each experiment's `artefacts.yaml`, by experiment folder, for those that
   * have one (ADR-0044). Left out where nothing has been loaded, which reads
   * as no artefacts yet.
   */
  artefacts?: Readonly<Record<string, LoadedArtefacts>>;
}

/** One write, in the order it must happen. Paths are project-relative, from `_notebook/`. */
export type Step =
  /** A file that must not exist yet. */
  | { kind: "create"; path: string; text: string }
  /** A file that exists and is replaced, keeping a snapshot of what it held. */
  | { kind: "replace"; path: string; text: string }
  /** A file or folder that is moved to `.trash/`. */
  | { kind: "trash"; path: string };

/**
 * What to write, in order, and the state once every step has been written.
 * The order is what makes a stop half-way harmless (ADR-0026): the files an
 * experiment or question is made of come first and `project.yaml` last.
 */
export interface Plan {
  steps: readonly Step[];
  next: NotebookState;
}

/** Why an operation was refused. Nothing is written for a refused operation. */
export type NotebookError =
  /** A value is not allowed by the format; `field` names it when one caused it. */
  | { kind: "invalid"; message: string; field?: string }
  /** The question, experiment, artefact or group named does not exist. */
  | {
      kind: "notFound";
      entity: "question" | "experiment" | "artefact" | "group";
      id: string;
    };

export const PROJECT_PATH = "_notebook/project.yaml";

/** `_notebook/questions/<file>`. */
export function questionPath(fileName: string): string {
  return `_notebook/questions/${fileName}`;
}

/** `_notebook/experiments/<folder>`. */
export function experimentFolderPath(folder: string): string {
  return `_notebook/experiments/${folder}`;
}

/** `_notebook/experiments/<folder>/artefacts.yaml`. */
export function artefactsPath(folder: string): string {
  return `${experimentFolderPath(folder)}/artefacts.yaml`;
}
