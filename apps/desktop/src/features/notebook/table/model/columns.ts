import type {
  ColumnKey,
  ProjectYamlModel,
  TableSettingsChange,
} from "@research-notebook/format";

type Table = ProjectYamlModel["table"];

/** The narrowest and widest a column can be made in the table, in CSS pixels. The format sets no bound. */
export const MIN_WIDTH = 80;
export const MAX_WIDTH = 1200;

/** The leading column (ref, title, status, dates) is not one of the six and cannot be hidden. */
export const EXPERIMENT_COLUMN_WIDTH = 260;

/** A column as the table shows it. */
export type ColumnLayout = { key: ColumnKey; width: number; hidden: boolean };

/** A width kept whole and inside the limits, whatever was asked for. */
export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

/** The six columns in the order `project.yaml` stores them (array order is display order). */
export function columnLayout(table: Table): ColumnLayout[] {
  return table.columns.map((column) => ({
    key: column.key,
    width: clampWidth(column.width),
    hidden: column.hidden,
  }));
}

/**
 * The columns that have a cell in each experiment row: those that are shown,
 * except Motivation, which is shown once per question in its header row
 * (spec 4.3).
 */
export function gridColumns(layout: readonly ColumnLayout[]): ColumnLayout[] {
  return layout.filter((c) => !c.hidden && c.key !== "motivation");
}

/** The Motivation column while it is shown; its width limits the summary in each question header. */
export function motivationColumn(
  layout: readonly ColumnLayout[],
): ColumnLayout | undefined {
  return layout.find((c) => c.key === "motivation" && !c.hidden);
}

/** The width of a row: the experiment column and every column shown. */
export function gridWidth(columns: readonly ColumnLayout[]): number {
  return columns.reduce((sum, c) => sum + c.width, EXPERIMENT_COLUMN_WIDTH);
}

/**
 * `table` with changes that are not saved yet applied, so the table shows
 * them at once and does not flick back while the save is under way.
 */
export function withOverlay(table: Table, overlay: TableSettingsChange): Table {
  let collapsed = [...table.collapsed_questions];
  for (const [id, isCollapsed] of Object.entries(overlay.collapsed ?? {})) {
    if (!isCollapsed) collapsed = collapsed.filter((other) => other !== id);
    else if (!collapsed.includes(id)) collapsed.push(id);
  }
  return {
    ...table,
    columns: table.columns.map((column) => ({
      ...column,
      width: overlay.widths?.[column.key] ?? column.width,
      hidden: overlay.hidden?.[column.key] ?? column.hidden,
    })),
    collapsed_questions: collapsed,
  };
}

/** Two sets of changes as one, the later value of anything in both winning. */
export function mergeOverlay(
  earlier: TableSettingsChange,
  later: TableSettingsChange,
): TableSettingsChange {
  const merged: TableSettingsChange = {};
  const widths = { ...earlier.widths, ...later.widths };
  const hidden = { ...earlier.hidden, ...later.hidden };
  const collapsed = { ...earlier.collapsed, ...later.collapsed };
  if (Object.keys(widths).length > 0) merged.widths = widths;
  if (Object.keys(hidden).length > 0) merged.hidden = hidden;
  if (Object.keys(collapsed).length > 0) merged.collapsed = collapsed;
  return merged;
}
