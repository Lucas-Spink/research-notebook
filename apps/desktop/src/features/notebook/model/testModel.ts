import { arrangeNotebook, type NotebookState } from "@research-notebook/format";
import type { NotebookActions, NotebookModel } from "../useNotebook";

/** For tests: actions that all succeed and change nothing. */
export const stubActions: NotebookActions = {
  createQuestion: () => Promise.resolve(true),
  createExperiment: () => Promise.resolve(true),
  editQuestion: () => Promise.resolve(true),
  editExperiment: () => Promise.resolve(true),
  moveExperiment: () => Promise.resolve(true),
  removeExperiment: () => Promise.resolve(true),
  removeQuestion: () => Promise.resolve(true),
  refresh: () => Promise.resolve(),
  editExperimentSection: () => Promise.resolve({ ok: true }),
  changeSettings: () => undefined,
  resetColumns: () => undefined,
  setUnassignedCollapsed: () => undefined,
};

/** For tests: what `useNotebook` holds once `state` has loaded into a writable project. */
export function testModel(
  state: NotebookState,
  overrides: Partial<NotebookModel> = {},
): NotebookModel {
  return {
    view: { status: "ready", loaded: { state, hashes: {} } },
    arranged: arrangeNotebook(state),
    table: state.project.table,
    unassignedCollapsed: false,
    busy: false,
    writable: true,
    notice: null,
    failure: null,
    actions: stubActions,
    projectId: state.project.id,
    ...overrides,
  };
}
