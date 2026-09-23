import {
  addToGroup,
  createGroup,
  deleteGroup,
  moveGroup,
  moveToGroup,
  removeFromGroup,
  renameGroup,
  reorderItem,
  type ArtefactsFileModel,
  type NotebookEnv,
  type NotebookError,
  type Result,
} from "@research-notebook/format";
import { assertNever } from "../../../shared/assertNever";

/**
 * Every change the Results tree asks for (spec 7.5). Positions are omitted
 * to mean the end. Move to and Add to are separate kinds (FR-GRP-02).
 */
export type GroupAction =
  | { kind: "createGroup"; name: string; parent: string | null }
  | { kind: "renameGroup"; groupId: string; name: string }
  | {
      kind: "moveGroup";
      groupId: string;
      parent: string | null;
      index?: number;
    }
  | { kind: "deleteGroup"; groupId: string }
  | { kind: "addToGroup"; artefactId: string; groupId: string; index?: number }
  | {
      kind: "moveToGroup";
      artefactId: string;
      /** `null`: the Ungrouped area. */
      from: string | null;
      to: string;
      index?: number;
    }
  | { kind: "removeFromGroup"; artefactId: string; groupId: string }
  | { kind: "reorderItem"; groupId: string; artefactId: string; index: number };

/** Carries out `action` on a parsed `artefacts.yaml` with `packages/format`. Nothing is written here. */
export function applyGroupAction(
  file: ArtefactsFileModel,
  action: GroupAction,
  env: NotebookEnv,
): Result<ArtefactsFileModel, NotebookError> {
  switch (action.kind) {
    case "createGroup": {
      const input = { name: action.name, parent: action.parent };
      const created = createGroup(file, input, env);
      return created.ok ? { ok: true, value: created.value.file } : created;
    }
    case "renameGroup":
      return renameGroup(file, action.groupId, action.name);
    case "moveGroup":
      return moveGroup(file, action.groupId, action.parent, action.index);
    case "deleteGroup":
      return deleteGroup(file, action.groupId);
    case "addToGroup":
      return addToGroup(file, action.artefactId, action.groupId, action.index);
    case "moveToGroup":
      return moveToGroup(
        file,
        action.artefactId,
        action.from,
        action.to,
        action.index,
      );
    case "removeFromGroup":
      return removeFromGroup(file, action.artefactId, action.groupId);
    case "reorderItem":
      return reorderItem(file, action.groupId, action.artefactId, action.index);
    default:
      return assertNever(action);
  }
}
