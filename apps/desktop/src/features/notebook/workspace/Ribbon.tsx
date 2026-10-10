import type { ColumnKey } from "@research-notebook/format";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { RibbonGroup, RibbonMenu } from "../../../shared/ribbon";
import { useSources } from "../../citations";
import type { Selected } from "../DetailsPanel";
import type { QuestionChoice } from "../ExperimentItem";
import { messages } from "../messages";
import { NewTitleForm } from "../NewTitleForm";
import { ColumnsMenu } from "../table/ColumnsMenu";
import type { ColumnLayout } from "../table/model/columns";
import type { FilterState, SortState } from "../table/model/rows";
import { FilterControls, SortControls } from "../table/TableToolbar";
import type { NotebookActions } from "../useNotebook";
import { paneMessages, ribbonMessages as m } from "./messages";
import type { ExportSection, PaneTab } from "./model/panes";
import { NewExperimentForm } from "./NewExperimentForm";
import { SelectionCommands } from "./SelectionCommands";

type Props = {
  /** The Project tab's controls, which belong to the projects feature. */
  projectControls: ReactNode;
  writable: boolean;
  /** Turns off one-shot actions while another is in flight, or the project is read-only. */
  disabled: boolean;
  actions: NotebookActions;
  selected: Selected | null;
  questions: QuestionChoice[];
  filter: FilterState;
  onFilter: (filter: FilterState) => void;
  sort: SortState;
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

const TAB_KEYS = [
  "home",
  "experiments",
  "sources",
  "view",
  "project",
  "export",
] as const;
type RibbonTab = (typeof TAB_KEYS)[number];

const SOURCES_TAB: PaneTab = { id: "sources", kind: "sources" };
const SEARCH_TAB: PaneTab = { id: "search", kind: "search" };
const CITATIONS_TAB: PaneTab = { id: "citations", kind: "citations" };
const DETAILS_TAB: PaneTab = { id: "details", kind: "details" };
const INTEGRITY_TAB: PaneTab = { id: "integrity", kind: "integrity" };
const exportTab = (section: ExportSection): PaneTab => ({
  id: `export:${section}`,
  kind: "export",
  section,
});

/**
 * The ribbon (S6-T01): a row of tabs, Home, Experiments, Sources, View,
 * Project and Export, and under it only the commands of the chosen tab, in labelled
 * groups, so nothing needs more width than a window has. Less common
 * actions sit in menus. It can be collapsed to its tabs alone to give the
 * table more height; choosing a tab then shows its commands over the table
 * until a press elsewhere or Escape.
 */
export function Ribbon(props: Props) {
  const { actions, selected, questions, disabled, openTabs, onOpenPane } =
    props;
  const sources = useSources();
  const ids = useId();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<RibbonTab>("home");
  const [collapsed, setCollapsed] = useState(false);
  // A collapsed ribbon shows the chosen tab's commands while this is set.
  const [peek, setPeek] = useState(false);
  const showing = !collapsed || peek;

  // The pane and the column headings stay just under this sticky ribbon.
  useEffect(() => {
    const node = root.current;
    if (node === null) return;
    const root_ = document.documentElement;
    const report = () =>
      root_.style.setProperty("--ribbon-height", `${node.offsetHeight}px`);
    report();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(report);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      root_.style.removeProperty("--ribbon-height");
    };
  }, []);

  useEffect(() => {
    if (!peek) return;
    function onPress(event: PointerEvent) {
      if (event.target instanceof Node && root.current?.contains(event.target))
        return;
      setPeek(false);
    }
    document.addEventListener("pointerdown", onPress);
    return () => document.removeEventListener("pointerdown", onPress);
  }, [peek]);

  const selectedQuestion =
    selected?.kind === "question"
      ? selected.group.question.file.frontmatter.id
      : selected?.kind === "experiment"
        ? (selected.item.experiment.file.frontmatter.question ?? "")
        : "";
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

  const newQuestion = (
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
  );
  const newExperiment = (
    <RibbonMenu
      label={m.newExperiment}
      disabled={disabled || questions.length === 0}
    >
      {(close) => (
        <NewExperimentForm
          questions={questions}
          initial={selectedQuestion}
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
  );
  const addResult = (
    <button
      type="button"
      className="ribbon__button"
      disabled={props.onAddResult === null}
      title={props.onAddResult === null ? m.noSelection : undefined}
      onClick={() => props.onAddResult?.()}
    >
      {m.addResult}
    </button>
  );
  const details = (
    <button
      type="button"
      className="ribbon__button"
      disabled={selected === null}
      title={selected === null ? paneMessages.noSelection : undefined}
      {...pane(DETAILS_TAB)}
    >
      {m.details}
    </button>
  );
  const sourcesPane = (
    <button type="button" className="ribbon__button" {...pane(SOURCES_TAB)}>
      {m.sourcesPane}
    </button>
  );
  const exportButton = (section: ExportSection, label: string) => (
    <button
      type="button"
      className="ribbon__button"
      {...pane(exportTab(section))}
    >
      {label}
    </button>
  );
  const filters = (
    <RibbonMenu label={m.filters}>
      <FilterControls filter={props.filter} onFilter={props.onFilter} />
    </RibbonMenu>
  );
  const sorting = (
    <RibbonMenu label={m.sorting}>
      <SortControls sort={props.sort} onSort={props.onSort} />
    </RibbonMenu>
  );
  const rows = (
    <>
      {plain(m.expandAll, () => props.onCollapseAll(false))}
      {plain(m.collapseAll, () => props.onCollapseAll(true))}
    </>
  );

  function commands(): ReactNode {
    switch (tab) {
      case "home":
        return (
          <>
            <RibbonGroup label={m.groups.add}>
              {newQuestion}
              {newExperiment}
              {addResult}
            </RibbonGroup>
            <RibbonGroup label={m.groups.selection}>
              <SelectionCommands
                selected={selected}
                questions={questions}
                actions={actions}
                disabled={disabled}
              />
            </RibbonGroup>
            <RibbonGroup label={m.groups.panes}>
              {details}
              {sourcesPane}
            </RibbonGroup>
          </>
        );
      case "experiments":
        return (
          <>
            <RibbonGroup label={m.groups.questions}>
              {newQuestion}
              {rows}
            </RibbonGroup>
            <RibbonGroup label={m.groups.find}>
              <button
                type="button"
                className="ribbon__button"
                {...pane(SEARCH_TAB)}
              >
                {m.search}
              </button>
              {filters}
            </RibbonGroup>
            <RibbonGroup label={m.groups.order}>{sorting}</RibbonGroup>
            <RibbonGroup label={m.groups.results}>
              {addResult}
              {details}
            </RibbonGroup>
          </>
        );
      case "sources":
        return (
          <>
            <RibbonGroup label={m.groups.library}>
              {sourcesPane}
              {plain(
                m.refreshSources,
                sources.refresh,
                !sources.writable || sources.busy,
              )}
            </RibbonGroup>
            <RibbonGroup label={m.groups.attach}>
              {plain(
                m.attachSource,
                () => onOpenPane(SOURCES_TAB),
                selected?.kind !== "experiment",
              )}
            </RibbonGroup>
            <RibbonGroup label={m.groups.citations}>
              <button
                type="button"
                className="ribbon__button"
                {...pane(CITATIONS_TAB)}
              >
                {m.citationStyle}
              </button>
            </RibbonGroup>
          </>
        );
      case "view":
        return (
          <>
            <RibbonGroup label={m.groups.table}>
              <RibbonMenu label={m.columns}>
                <ColumnsMenu
                  layout={props.layout}
                  writable={props.writable}
                  onHide={props.onHide}
                  onWidth={props.onWidth}
                  onReset={props.onReset}
                />
              </RibbonMenu>
              {filters}
              {sorting}
            </RibbonGroup>
            <RibbonGroup label={m.groups.rows}>{rows}</RibbonGroup>
          </>
        );
      case "project":
        return (
          <>
            <RibbonGroup label={m.groups.project}>
              {props.projectControls}
            </RibbonGroup>
            <RibbonGroup label={m.groups.check}>
              <button
                type="button"
                className="ribbon__button"
                {...pane(INTEGRITY_TAB)}
              >
                {m.integrityCheck}
              </button>
            </RibbonGroup>
          </>
        );
      case "export":
        return (
          <>
            <RibbonGroup label={m.groups.documents}>
              {exportButton("pdf", m.exportPdf)}
              {exportButton("html", m.exportHtml)}
            </RibbonGroup>
            <RibbonGroup label={m.groups.data}>
              {exportButton("machine", m.exportMachine)}
            </RibbonGroup>
            <RibbonGroup label={m.groups.packages}>
              {exportButton("bundles", m.exportBundles)}
              {exportButton("gitBundle", m.exportGitBundle)}
            </RibbonGroup>
            {props.archivable && (
              <RibbonGroup label={m.groups.preservation}>
                {exportButton("archive", m.archiveProject)}
              </RibbonGroup>
            )}
          </>
        );
    }
  }

  function choose(next: RibbonTab) {
    setTab(next);
    // A collapsed ribbon shows the commands of a tab chosen, and hides them again on choosing it twice.
    if (collapsed) setPeek(next !== tab || !peek);
  }

  function onTabKeys(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = TAB_KEYS.indexOf(tab);
    const next = TAB_KEYS[(at + step + TAB_KEYS.length) % TAB_KEYS.length];
    if (next === undefined) return;
    choose(next);
    root.current
      ?.querySelector<HTMLElement>(`[data-ribbon-tab="${next}"]`)
      ?.focus();
  }

  return (
    <div
      ref={root}
      className={`ribbon${collapsed ? " ribbon--collapsed" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && peek && !event.defaultPrevented)
          setPeek(false);
      }}
    >
      <div className="ribbon__tabbar">
        <h1 className="ribbon__brand">{messages.appTitle}</h1>
        <div
          role="tablist"
          aria-label={m.tabsLabel}
          className="ribbon__tabs"
          onKeyDown={onTabKeys}
        >
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${ids}-${key}`}
              data-ribbon-tab={key}
              aria-selected={tab === key}
              aria-controls={`${ids}-panel`}
              tabIndex={tab === key ? 0 : -1}
              className="ribbon__tab"
              onClick={() => choose(key)}
            >
              {m.tabs[key]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ribbon__collapse"
          aria-expanded={!collapsed}
          aria-label={collapsed ? m.expand : m.collapse}
          title={collapsed ? m.expand : m.collapse}
          onClick={() => {
            setCollapsed(!collapsed);
            setPeek(false);
          }}
        >
          <span aria-hidden="true">{collapsed ? "▾" : "▴"}</span>
        </button>
      </div>
      {showing && (
        <div
          role="tabpanel"
          id={`${ids}-panel`}
          aria-labelledby={`${ids}-${tab}`}
          className={`ribbon__commands${collapsed ? " ribbon__commands--peek" : ""}`}
        >
          <div role="toolbar" aria-label={m.label} className="ribbon__toolbar">
            {commands()}
          </div>
        </div>
      )}
    </div>
  );
}
