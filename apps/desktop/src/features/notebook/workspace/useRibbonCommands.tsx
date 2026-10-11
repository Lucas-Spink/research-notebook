import type { ReactNode } from "react";
import { RibbonMenu } from "../../../shared/ribbon";
import { useTheme } from "../../../shared/theme";
import { useSources } from "../../citations";
import { messages } from "../messages";
import { NewTitleForm } from "../NewTitleForm";
import { ColumnsMenu } from "../table/ColumnsMenu";
import { FilterControls, SortControls } from "../table/TableToolbar";
import { ribbonMessages as m } from "./messages";
import type { ExportSection, PaneTab } from "./model/panes";
import { MoveToBinCommand } from "./MoveToBinCommand";
import { NewExperimentForm } from "./NewExperimentForm";
import type { CommandId } from "./ribbonLayout";
import type { RibbonProps } from "./ribbonProps";

const SOURCES_TAB: PaneTab = { id: "sources", kind: "sources" };
const SEARCH_TAB: PaneTab = { id: "search", kind: "search" };
const CITATIONS_TAB: PaneTab = { id: "citations", kind: "citations" };
const DETAILS_TAB: PaneTab = { id: "details", kind: "details" };
const INTEGRITY_TAB: PaneTab = { id: "integrity", kind: "integrity" };
const BIN_TAB: PaneTab = { id: "bin", kind: "bin" };
const exportTab = (section: ExportSection): PaneTab => ({
  id: `export:${section}`,
  kind: "export",
  section,
});

/** The id of the question the selection belongs to, for pre-filling New experiment. */
export function questionOfSelection(selected: RibbonProps["selected"]): string {
  if (selected?.kind === "question")
    return selected.group.question.file.frontmatter.id;
  if (selected?.kind === "experiment")
    return selected.item.experiment.file.frontmatter.question ?? "";
  return "";
}

/**
 * The ribbon's commands, by id. A command that does not apply here (no
 * project to close, nothing to archive) is `null`, so the layout can leave
 * it, and a group with nothing in it, out.
 */
export function useRibbonCommands(
  props: RibbonProps,
): Record<CommandId, ReactNode> {
  const { actions, selected, questions, disabled, openTabs, onOpenPane } =
    props;
  const sources = useSources();
  const { theme, setTheme } = useTheme();

  const pane = (target: PaneTab) => ({
    "aria-pressed": openTabs.has(target.id),
    onClick: () => onOpenPane(target),
  });
  const plain = (label: string, onClick: () => void, off = false) => (
    <button
      type="button"
      className="ribbon__button"
      disabled={off}
      onClick={onClick}
    >
      {label}
    </button>
  );
  const paneButton = (label: string, target: PaneTab, off = false) => (
    <button
      type="button"
      className="ribbon__button"
      disabled={off}
      title={off ? m.selectionHint : undefined}
      {...pane(target)}
    >
      {label}
    </button>
  );
  const exportButton = (section: ExportSection, label: string) =>
    paneButton(label, exportTab(section));

  return {
    allProjects:
      props.onCloseProject === undefined
        ? null
        : plain(m.allProjects, props.onCloseProject),
    projectControls: props.projectControls,
    newQuestion: (
      <RibbonMenu label={m.newQuestion} disabled={disabled}>
        {(close) => (
          <NewTitleForm
            label={messages.newQuestionLabel}
            placeholder={messages.newQuestionPlaceholder}
            submitLabel={messages.addQuestion}
            disabled={disabled}
            onSubmit={(title) =>
              actions.createQuestion(title).then((done) => {
                if (done) close();
                return done;
              })
            }
          />
        )}
      </RibbonMenu>
    ),
    newExperiment: (
      <RibbonMenu
        label={m.newExperiment}
        disabled={disabled || questions.length === 0}
      >
        {(close) => (
          <NewExperimentForm
            questions={questions}
            initial={questionOfSelection(selected)}
            disabled={disabled}
            onCreate={(id, title) =>
              actions.createExperiment(id, title).then((done) => {
                if (done) close();
                return done;
              })
            }
          />
        )}
      </RibbonMenu>
    ),
    addResult: (
      <button
        type="button"
        className="ribbon__button"
        disabled={props.onAddResult === null}
        title={props.onAddResult === null ? m.selectionHint : undefined}
        onClick={() => props.onAddResult?.()}
      >
        {m.addResult}
      </button>
    ),
    moveToBin: (
      <MoveToBinCommand
        selected={selected}
        actions={actions}
        disabled={disabled}
      />
    ),
    details: paneButton(m.details, DETAILS_TAB, selected === null),
    settingsControls: props.settingsControls ?? null,
    integrityCheck: paneButton(m.integrityCheck, INTEGRITY_TAB),
    sourcesPane: paneButton(m.sourcesPane, SOURCES_TAB),
    binPane: paneButton(m.binPane, BIN_TAB),
    search: paneButton(m.search, SEARCH_TAB),
    filters: (
      <RibbonMenu label={m.filters}>
        <FilterControls filter={props.filter} onFilter={props.onFilter} />
      </RibbonMenu>
    ),
    sorting: (
      <RibbonMenu label={m.sorting}>
        <SortControls sort={props.sort} onSort={props.onSort} />
      </RibbonMenu>
    ),
    columns: (
      <RibbonMenu label={m.columns}>
        <ColumnsMenu
          layout={props.layout}
          writable={props.writable}
          onHide={props.onHide}
          onWidth={props.onWidth}
          onReset={props.onReset}
        />
      </RibbonMenu>
    ),
    density: (
      <button
        type="button"
        className="ribbon__button"
        aria-pressed={props.compact}
        onClick={() => props.onCompact(!props.compact)}
      >
        {props.compact ? m.compactOverview : m.detailedComparison}
      </button>
    ),
    expandAll: plain(m.expandAll, () => props.onCollapseAll(false)),
    collapseAll: plain(m.collapseAll, () => props.onCollapseAll(true)),
    darkMode: (
      <button
        type="button"
        className="ribbon__button"
        aria-pressed={theme === "dark"}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {m.darkMode}
      </button>
    ),
    refreshSources: plain(
      m.refreshSources,
      sources.refresh,
      !sources.writable || sources.busy,
    ),
    attachSource: plain(
      m.attachSource,
      () => onOpenPane(SOURCES_TAB),
      selected?.kind !== "experiment",
    ),
    citationStyle: paneButton(m.citationStyle, CITATIONS_TAB),
    exportPdf: exportButton("pdf", m.exportPdf),
    exportHtml: exportButton("html", m.exportHtml),
    exportMachine: exportButton("machine", m.exportMachine),
    exportBundles: exportButton("bundles", m.exportBundles),
    exportGitBundle: exportButton("gitBundle", m.exportGitBundle),
    archiveProject: props.archivable
      ? exportButton("archive", m.archiveProject)
      : null,
  };
}
