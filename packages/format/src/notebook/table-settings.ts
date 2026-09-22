import { DEFAULT_COLUMN_WIDTHS } from "../files/new-project";
import { fail, ok, type Result } from "../result";
import { COLUMN_KEYS, type ProjectYamlModel } from "../schema";
import {
  checkedProject,
  invalid,
  missingQuestion,
  noChange,
  projectStep,
  stamped,
  tidied,
} from "./project-edit";
import type { NotebookEnv, NotebookError, NotebookState, Plan } from "./types";

export type ColumnKey = (typeof COLUMN_KEYS)[number];

/**
 * Changes to the table's layout, kept in `project.yaml` so it travels with
 * the project (FR-TBL-04, FR-TBL-02). Anything left out stays as it is.
 */
export interface TableSettingsChange {
  /** New width in CSS pixels, a whole number of at least 1. */
  widths?: Partial<Record<ColumnKey, number>>;
  hidden?: Partial<Record<ColumnKey, boolean>>;
  /** Question ID to whether the question is collapsed. */
  collapsed?: Record<string, boolean>;
}

type Table = ProjectYamlModel["table"];

const sameColumns = (a: Table["columns"], b: Table["columns"]): boolean =>
  a.length === b.length &&
  a.every(
    (column, i) =>
      column.key === b[i]?.key &&
      column.width === b[i]?.width &&
      column.hidden === b[i]?.hidden,
  );

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, i) => item === b[i]);

/** Writes `table` into `project.yaml` if it differs from what is there. */
function withTable(
  state: NotebookState,
  table: Table,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const before = state.project.table;
  if (
    sameColumns(before.columns, table.columns) &&
    sameList(before.collapsed_questions, table.collapsed_questions)
  ) {
    return ok(noChange(state));
  }
  const project = checkedProject(
    tidied(
      stamped({ ...state.project, table }, env),
      state.questions,
      state.experiments,
      state.unreadable,
    ),
  );
  if (!project.ok) return project;
  return ok({
    steps: [projectStep(project.value)],
    next: { ...state, project: project.value },
  });
}

/**
 * Applies width, visibility and collapse changes in one write of
 * `project.yaml`, so a burst of changes makes one snapshot, not several. The
 * order of the columns, unknown keys and everything else are carried over.
 * Nothing is written when nothing would change.
 */
export function changeTableSettings(
  state: NotebookState,
  change: TableSettingsChange,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  for (const width of Object.values(change.widths ?? {})) {
    if (!Number.isInteger(width) || width < 1) {
      return fail(
        invalid("a column width is a whole number of at least 1", "width"),
      );
    }
  }
  const before = state.project.table;
  let collapsed = [...before.collapsed_questions];
  for (const [id, isCollapsed] of Object.entries(change.collapsed ?? {})) {
    if (!state.questions.some((q) => q.file.frontmatter.id === id)) {
      return fail(missingQuestion(id));
    }
    if (!isCollapsed) collapsed = collapsed.filter((other) => other !== id);
    else if (!collapsed.includes(id)) collapsed.push(id);
  }
  const columns = before.columns.map((column) => ({
    ...column,
    width: change.widths?.[column.key] ?? column.width,
    hidden: change.hidden?.[column.key] ?? column.hidden,
  }));
  return withTable(
    state,
    { ...before, columns, collapsed_questions: collapsed },
    env,
  );
}

/**
 * Puts every column back to its default width, order and visibility. Which
 * questions are collapsed is left alone.
 */
export function resetTableColumns(
  state: NotebookState,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const before = state.project.table;
  const columns = COLUMN_KEYS.map((key) => ({
    ...before.columns.find((column) => column.key === key),
    key,
    width: DEFAULT_COLUMN_WIDTHS[key],
    hidden: false,
  }));
  return withTable(state, { ...before, columns }, env);
}
