import { serialiseArtefacts } from "../files/artefacts";
import { fail, ok, type Result } from "../result";
import type { ArtefactsFileModel } from "../schema";
import { withWriterStamp } from "./edit";
import { invalid, missingExperiment, noChange } from "./project-edit";
import {
  artefactsPath,
  type NotebookEnv,
  type NotebookError,
  type NotebookState,
  type Plan,
} from "./types";

/** An experiment's evidence before anything has been added: what a new experiment's artefacts.yaml holds. */
export const EMPTY_ARTEFACTS: ArtefactsFileModel = {
  format_version: 1,
  artefacts: [],
  groups: [],
};

/**
 * An experiment's evidence as loaded: its file, an empty one when it has
 * none yet, or `null` when its artefacts.yaml could not be read, so nothing
 * may be built on it (AGENTS.md rule 5).
 */
export function artefactsOf(
  state: NotebookState,
  folder: string,
): ArtefactsFileModel | null {
  const loaded = state.artefacts?.[folder];
  if (loaded === undefined) return EMPTY_ARTEFACTS;
  return loaded.kind === "file" ? loaded.file : null;
}

/**
 * Changes one experiment's artefacts.yaml (ADR-0044 point 3): `change` gets
 * the file as loaded (or empty when there is none) and returns the next one,
 * which is written like any other notebook file, creating it if absent. The
 * running version is recorded first, as for every edit (ADR-0025 point 8).
 * Nothing is written when nothing changes, and an artefacts.yaml that could
 * not be read is never written over.
 */
export function editArtefacts(
  state: NotebookState,
  folder: string,
  change: (
    file: ArtefactsFileModel,
  ) => Result<ArtefactsFileModel, NotebookError>,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  if (!state.experiments.some((e) => e.folder === folder)) {
    return fail(missingExperiment(folder));
  }
  const before = artefactsOf(state, folder);
  if (before === null) {
    return fail(
      invalid(
        "This experiment's artefacts.yaml could not be read, so it is left as it is.",
      ),
    );
  }
  const changed = change(before);
  if (!changed.ok) return changed;
  const exists = state.artefacts?.[folder] !== undefined;
  const text = serialiseArtefacts(changed.value);
  if (exists && text === serialiseArtefacts(before)) return ok(noChange(state));

  const stamp = withWriterStamp(state, env);
  return ok({
    steps: [
      ...stamp.steps,
      {
        kind: exists ? "replace" : "create",
        path: artefactsPath(folder),
        text,
      },
    ],
    next: {
      ...stamp.state,
      artefacts: {
        ...state.artefacts,
        [folder]: { kind: "file", file: changed.value },
      },
    },
  });
}
