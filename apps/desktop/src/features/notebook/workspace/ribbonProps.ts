import type { ColumnKey } from "@research-notebook/format";
import type { ReactNode } from "react";
import type { Selected } from "../DetailsPanel";
import type { QuestionChoice } from "../ExperimentItem";
import type { ColumnLayout } from "../table/model/columns";
import type { FilterState, SortState } from "../table/model/rows";
import type { NotebookActions } from "../useNotebook";
import type { IntegrityStatus } from "./ProjectHeader";
import type { PaneTab } from "./model/panes";

/** What the ribbon is given by the notebook view. */
export type RibbonProps = {
  /** The open project's name, shown beside the application title so the research context is always visible. */
  projectName?: string | null;
  /** Closes the project and returns to the start page. */
  onCloseProject?: () => void;
  /** Home's Project group controls (new, open, recent), which belong to the projects feature. */
  projectControls: ReactNode;
  /** Home's Settings group controls (project settings, Zotero), which belong to the projects feature. */
  settingsControls?: ReactNode;
  /** Key figures for the project header. */
  summary?: { experiments: number; results: number };
  integrity?: IntegrityStatus;
  /** The project was archived: it is shown read-only and says so. */
  isArchived?: boolean;
  writable: boolean;
  /** Turns off one-shot actions while another is in flight, or the project is read-only. */
  disabled: boolean;
  actions: NotebookActions;
  selected: Selected | null;
  questions: QuestionChoice[];
  filter: FilterState;
  onFilter: (filter: FilterState) => void;
  sort: SortState;
  /** Whether the table clamps long text (Compact overview) or shows it all (Detailed comparison). */
  compact: boolean;
  onCompact: (compact: boolean) => void;
  onSort: (sort: SortState) => void;
  layout: readonly ColumnLayout[];
  onHide: (key: ColumnKey, hidden: boolean) => void;
  onWidth: (key: ColumnKey, width: number) => void;
  onReset: () => void;
  /** Collapses or expands every question and the Unassigned group. */
  onCollapseAll: (collapsed: boolean) => void;
  /** Opens the selected experiment's Results cell, where files are added. */
  onAddResult: (() => void) | null;
  /** Whether the project can be archived here, which adds the Archive command. */
  archivable: boolean;
  /** The tab ids that are open, to show which ribbon buttons they belong to. */
  openTabs: ReadonlySet<string>;
  onOpenPane: (tab: PaneTab) => void;
};
