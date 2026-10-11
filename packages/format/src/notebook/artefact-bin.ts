import { fail, ok, type Result } from "../result";
import {
  ArtefactsFile,
  type ArtefactModel,
  type ArtefactsFileModel,
  type GroupModel,
} from "../schema";
import { invalid } from "./project-edit";
import type { NotebookError } from "./types";
import { refusal } from "./util";

/*
 * Removing a file from an experiment and bringing it back from the bin. Both
 * change `artefacts.yaml` only; the files themselves are moved by `nb-fs`.
 */

type Changed = Result<ArtefactsFileModel, NotebookError>;

function withoutMember(
  groups: readonly GroupModel[],
  id: string,
): GroupModel[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item !== id),
    groups: withoutMember(group.groups, id),
  }));
}

/** Validates the result the way the file is read, so nothing invalid is ever written. */
function checked(file: ArtefactsFileModel): Changed {
  const result = ArtefactsFile.safeParse(file);
  return result.success ? ok(result.data) : fail(refusal(result.error));
}

/**
 * Takes an artefact out of the file and out of every group that held it.
 * Every other artefact, version and group is carried over unchanged.
 */
export function removeArtefact(
  file: ArtefactsFileModel,
  artefactId: string,
): Changed {
  if (!file.artefacts.some((artefact) => artefact.id === artefactId)) {
    return fail({ kind: "notFound", entity: "artefact", id: artefactId });
  }
  return checked({
    ...file,
    artefacts: file.artefacts.filter((artefact) => artefact.id !== artefactId),
    groups: withoutMember(file.groups, artefactId),
  });
}

/**
 * Puts a binned artefact's record back at the end of the file, in no group
 * (a group's membership is not kept in the bin). Refused if its id is
 * already taken, so a restore never replaces a record.
 */
export function restoreArtefact(
  file: ArtefactsFileModel,
  artefact: ArtefactModel,
): Changed {
  if (file.artefacts.some((existing) => existing.id === artefact.id)) {
    return fail(
      invalid("an artefact with this id is already in the notebook", "id"),
    );
  }
  return checked({ ...file, artefacts: [...file.artefacts, artefact] });
}
