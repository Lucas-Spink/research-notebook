import {
  buildCitedByIndex,
  buildReferenceIndex,
  type Arranged,
  type ArtefactModel,
  type ColumnKey,
  type Problem,
  type RecognisedSectionKey,
  type CitedByIndex,
  type ReferenceIndex,
} from "@research-notebook/format";
import {
  useCallback,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { commands, type FolderHandle } from "../../ipc/bindings";
import {
  CitationActionsProvider,
  LiteraturePrompt,
  StylePicker,
  SourcesProvider,
  useLiteraturePlanner,
  useSources,
  useSourceSync,
  useSourceRepair,
  useStyleManagement,
} from "../citations";
import { ManifestPanel, useManifest } from "../archive";
import {
  IntegrityPanel,
  useIntegrityCheck,
  type ResolveTarget,
} from "../integrity";
import { DetailsPanel, type Selected } from "./DetailsPanel";
import type { LiveTarget } from "./editing/model/liveEditor";
import { useLiveEditor } from "./editing/useLiveEditor";
import type { QuestionChoice } from "./ExperimentItem";
import { inboxRequestMessage, messages, problemMessage } from "./messages";
import { SearchPanel } from "./search/SearchPanel";
import { columnLayout } from "./table/model/columns";
import {
  UNASSIGNED_KEY,
  buildRows,
  type FilterState,
  type HeaderRow,
  type SortState,
} from "./table/model/rows";
import { useTableEditing } from "./table/useTableEditing";
import { WorkspaceTable } from "./table/WorkspaceTable";
import { assertNever } from "../../shared/assertNever";
import { evidenceOf } from "./model/evidence";
import { paneMessages, ribbonMessages } from "./workspace/messages";
import {
  addResultTabId,
  resultsTabId,
  initialPanes,
  panesReducer,
  resultTabId,
  type PaneTab,
} from "./workspace/model/panes";
import {
  BibliographyPanel,
  type BibliographyTarget,
} from "./workspace/BibliographyPanel";
import { attachedCitekeys } from "./workspace/model/attach";
import { AddResultPane } from "./workspace/AddResultPane";
import { PaneHost } from "./workspace/PaneHost";
import { PaneTabIcon } from "./workspace/PaneTabIcon";
import { ResultPane } from "./workspace/ResultPane";
import { ResultsPane } from "./workspace/ResultsPane";
import { Ribbon } from "./workspace/Ribbon";
import { SourcesPane } from "./workspace/SourcesPane";
import { useSourceAttach } from "./workspace/useSourceAttach";
import type { NotebookModel } from "./useNotebook";
import "./NotebookPanel.css";

const NO_FILTER: FilterState = { text: "", status: "all" };
const EMPTY_REFERENCES: ReferenceIndex = new Map();
const EMPTY_CITED_BY: CitedByIndex = new Map();

/** The refs that two or more files of one kind hold, so each can be flagged where it is shown. */
function sharedRefs(problems: readonly Problem[]): ReadonlySet<string> {
  return new Set(
    problems.flatMap((p) => (p.kind === "duplicateRef" ? [p.ref] : [])),
  );
}

/** What a table row key selects, looked up each time so a deleted item just stops being selected. */
function findSelected(
  arranged: Arranged | null,
  key: string | null,
): Selected | null {
  if (key === null || arranged === null) return null;
  const group = arranged.questions.find(
    (q) => `question:${q.question.fileName}` === key,
  );
  if (group !== undefined) return { kind: "question", group };
  const groups = [
    ...arranged.questions.map((q) => q.experiments),
    arranged.unassigned,
  ];
  for (const items of groups) {
    const item = items.find((i) => `experiment:${i.experiment.folder}` === key);
    if (item !== undefined) return { kind: "experiment", item };
  }
  return null;
}

/** The section a new selection opens live in the expanded view: Methods, or the one a search result points to. */
function openedSection(
  selected: Selected | null,
  section: RecognisedSectionKey | null,
): LiveTarget | null {
  return selected?.kind === "experiment"
    ? {
        folder: selected.item.experiment.folder,
        section: section ?? "methods",
        surface: "details",
      }
    : null;
}

/**
 * The open project's questions and experiments as a table (FR-TBL-01 to
 * FR-TBL-05, FR-TBL-10) with the tools to change them below it. It renders
 * what `useNotebook` holds and asks it to act; it does no I/O. Filter, sort
 * and the selection are only what the person is looking at, so they are not
 * saved anywhere.
 */
export function NotebookView(props: NotebookViewProps) {
  return (
    <SourcesProvider folder={props.folder} writable={props.notebook.writable}>
      <NotebookViewBody {...props} />
    </SourcesProvider>
  );
}

type NotebookViewProps = {
  notebook: NotebookModel;
  /** The open project, so the expanded view can read an experiment's artefacts.yaml (FR-EDT-04). */
  folder: FolderHandle;
  /** Height of the table's window before it is measured. Only tests set it. */
  viewportHeight?: number;
  /** The ribbon's Project group, which belongs to the projects feature. */
  projectControls?: ReactNode;
  /** Notices from the project, kept under the ribbon. */
  projectBanners?: ReactNode;
};

/** Inside the sources provider, so a save can render Literature from `bibliography.json`. */
function NotebookViewBody({
  notebook,
  folder,
  viewportHeight,
  projectControls,
  projectBanners,
}: NotebookViewProps) {
  const {
    view,
    arranged,
    table,
    unassignedCollapsed,
    busy,
    writable,
    notice,
    failure,
    invalidInboxRequests,
    actions,
    projectId,
  } = notebook;
  const disabled = busy || !writable;
  const [filter, setFilter] = useState<FilterState>(NO_FILTER);
  const [sort, setSort] = useState<SortState>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** The row picked on purpose (its title, header or a search result): the only one highlighted. Choosing a cell selects its row for the ribbon's actions without highlighting it. */
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  /** Which section to focus, set only when the selection came from a search result (FR-SRC-02). */
  const [focusSection, setFocusSection] = useState<RecognisedSectionKey | null>(
    null,
  );

  const literature = useLiteraturePlanner({
    folder,
    styleFile: notebook.citationStyle,
  });
  const styles = useStyleManagement({
    folder,
    state: notebook.loadedState,
    writable,
    apply: (change) => actions.changeCitationStyle(change),
  });
  const repair = useSourceRepair({
    folder,
    state: notebook.loadedState,
    writable,
    apply: (change) => actions.replaceSource(change),
  });
  const live = useLiveEditor({
    arranged,
    save: (id, section, text) =>
      actions.editExperimentSection(id, section, text, literature.plan),
  });

  const [panes, dispatchPanes] = useReducer(panesReducer, initialPanes);
  const syncInserted = useSourceSync();
  const sources = useSources();
  // A citation in the text asks for its entry in the Bibliography below the table.
  const [bibliographyTarget, setBibliographyTarget] =
    useState<BibliographyTarget>(null);
  const jumpToCitation = useCallback(
    (citekey: string) =>
      setBibliographyTarget((previous) => ({
        citekey,
        n: (previous?.n ?? 0) + 1,
      })),
    [],
  );

  // A new selection always moves on: its section opens once the old one's
  // pending text has been tried (ADR-0043).
  function openSelection(key: string, section: RecognisedSectionKey | null) {
    setSelectedKey(key);
    setPickedKey(key);
    setFocusSection(section);
    void live.activate(openedSection(findSelected(arranged, key), section), {
      force: true,
    });
  }

  function select(key: string) {
    openSelection(key, null);
  }

  const integrity = useIntegrityCheck({
    api: commands,
    folder,
    projectId,
    arranged,
    bibliography: sources.items,
  });

  const manifest = useManifest({ api: commands, folder, arranged, writable });

  /** Takes the person to the existing place a finding is put right (FR-ARC-01). */
  function resolveFinding(target: ResolveTarget) {
    switch (target.kind) {
      case "results":
        dispatchPanes({
          type: "open",
          tab: {
            id: resultsTabId(target.experimentFolder),
            kind: "results",
            experimentFolder: target.experimentFolder,
          },
        });
        return;
      case "experiment":
        openSelection(`experiment:${target.experimentFolder}`, target.section);
        return;
      case "source":
        dispatchPanes({
          type: "open",
          tab: { id: "sources", kind: "sources" },
        });
        sources.select(target.citekey);
        return;
      default:
        assertNever(target);
    }
  }

  const layout = useMemo(
    () => (table === null ? [] : columnLayout(table)),
    [table],
  );
  const collapsed = useMemo(
    () =>
      new Set([
        ...(table?.collapsed_questions ?? []),
        ...(unassignedCollapsed ? [UNASSIGNED_KEY] : []),
      ]),
    [table, unassignedCollapsed],
  );
  const rows = useMemo(
    () =>
      arranged === null ? [] : buildRows(arranged, { collapsed, sort, filter }),
    [arranged, collapsed, sort, filter],
  );
  const shared = useMemo(
    () => sharedRefs(arranged?.problems ?? []),
    [arranged],
  );
  const references = useMemo(
    () =>
      arranged === null ? EMPTY_REFERENCES : buildReferenceIndex(arranged),
    [arranged],
  );
  const citedBy = useMemo(
    () => (arranged === null ? EMPTY_CITED_BY : buildCitedByIndex(arranged)),
    [arranged],
  );
  const editing = useTableEditing({
    live,
    writable,
    projectId,
    references,
    evidence: notebook.evidence,
    actions,
    onSelectRow: (row) => {
      setSelectedKey(row.key);
      setPickedKey(null);
      setFocusSection(null);
    },
    onOpenResultsPane: (experimentFolder) =>
      dispatchPanes({
        type: "open",
        tab: {
          id: resultsTabId(experimentFolder),
          kind: "results",
          experimentFolder,
        },
      }),
    onOpenAddResult: (experimentFolder) =>
      dispatchPanes({
        type: "open",
        tab: {
          id: addResultTabId(experimentFolder),
          kind: "addResult",
          experimentFolder,
        },
      }),
    onOpenResult: (experimentFolder, artefactId, version) =>
      dispatchPanes({
        type: "open",
        tab: {
          id: resultTabId(experimentFolder, artefactId),
          kind: "result",
          experimentFolder,
          artefactId,
          version,
        },
      }),
  });
  const questions = useMemo<QuestionChoice[]>(
    () =>
      (arranged?.questions ?? [])
        .filter((group) => !group.readOnly)
        .map(({ question }) => ({
          id: question.file.frontmatter.id,
          label: `${question.file.frontmatter.ref} ${question.file.frontmatter.title}`,
        })),
    [arranged],
  );

  const selected = useMemo(
    () => findSelected(arranged, selectedKey),
    [selectedKey, arranged],
  );

  function toggle(row: HeaderRow) {
    if (row.questionId === null) {
      actions.setUnassignedCollapsed(!row.collapsed);
    } else {
      actions.changeSettings({
        collapsed: { [row.questionId]: !row.collapsed },
      });
    }
  }

  const resize = (
    key: ColumnKey,
    width: number,
    options: { immediate: boolean },
  ) => actions.changeSettings({ widths: { [key]: width } }, options);

  const attach = useSourceAttach({
    item: selected?.kind === "experiment" ? selected.item : null,
    live,
    writable,
    save: (id, section, text) =>
      actions.editExperimentSection(id, section, text, literature.plan),
    sync: syncInserted,
  });

  // A click on a citation shows its source in the side pane; a double click
  // goes down the page to its Bibliography entry.
  const citationActions = useMemo(
    () => ({
      open: () =>
        dispatchPanes({
          type: "open",
          tab: { id: "sources", kind: "sources" },
        }),
      jump: jumpToCitation,
    }),
    [jumpToCitation],
  );

  /** Every source cited anywhere in the project, for the Bibliography. */
  const citedSources = useMemo(
    () =>
      new Set(
        [
          ...(arranged?.questions ?? []).flatMap((group) => group.experiments),
          ...(arranged?.unassigned ?? []),
        ].flatMap((item) => [...attachedCitekeys(item.experiment.file.body)]),
      ),
    [arranged],
  );

  function collapseAll(collapse: boolean) {
    const ids = (arranged?.questions ?? []).map(
      (group) => group.question.file.frontmatter.id,
    );
    actions.changeSettings({
      collapsed: Object.fromEntries(ids.map((id) => [id, collapse])),
    });
    actions.setUnassignedCollapsed(collapse);
  }

  /** The selected experiment's row, when it is in view, so Add result can open its Results cell. */
  const selectedRow = rows.find(
    (row) => row.kind === "experiment" && row.key === selectedKey,
  );
  const addResult =
    selectedRow?.kind === "experiment" && writable && !selectedRow.item.readOnly
      ? () => editing.onAddResult(selectedRow)
      : null;

  /** The artefact a result tab shows, if it is still there. */
  function artefactOf(tab: PaneTab): ArtefactModel | undefined {
    if (tab.kind !== "result") return undefined;
    const item = (arranged?.questions ?? [])
      .flatMap((group) => group.experiments)
      .concat(arranged?.unassigned ?? [])
      .find(
        (candidate) => candidate.experiment.folder === tab.experimentFolder,
      );
    const artefacts = item === undefined ? null : evidenceOf(item);
    return artefacts?.artefacts.find((a) => a.id === tab.artefactId);
  }

  function iconOf(tab: PaneTab): ReactNode {
    return (
      <PaneTabIcon tab={tab} artefactType={artefactOf(tab)?.type ?? null} />
    );
  }

  function titleOf(tab: PaneTab): string {
    switch (tab.kind) {
      case "sources":
        return paneMessages.sourcesTab;
      case "search":
        return paneMessages.searchTab;
      case "citations":
        return paneMessages.citationsTab;
      case "details":
        return paneMessages.detailsTab;
      case "integrity":
        return paneMessages.integrityTab;
      case "addResult":
        return paneMessages.addResultTab;
      case "results":
        return paneMessages.resultsTab;
      case "result": {
        const item = (arranged?.questions ?? [])
          .flatMap((group) => group.experiments)
          .concat(arranged?.unassigned ?? [])
          .find(
            (candidate) => candidate.experiment.folder === tab.experimentFolder,
          );
        const artefacts = item === undefined ? null : evidenceOf(item);
        return (
          artefacts?.artefacts.find((a) => a.id === tab.artefactId)?.name ??
          paneMessages.resultTab
        );
      }
      default:
        return assertNever(tab);
    }
  }

  function paneContent(tab: PaneTab): ReactNode {
    if (arranged === null) return null;
    switch (tab.kind) {
      case "sources":
        return (
          <SourcesPane
            repair={repair}
            attach={attach}
            citedBy={citedBy}
            onOpenExperiment={(experimentFolder) =>
              openSelection(`experiment:${experimentFolder}`, null)
            }
          />
        );
      case "search":
        return (
          <SearchPanel
            embedded
            arranged={arranged}
            folder={folder}
            onOpenResult={openSelection}
          />
        );
      case "citations":
        return <StylePicker model={styles} />;
      case "integrity":
        return (
          <>
            <IntegrityPanel model={integrity} onResolve={resolveFinding} />
            <ManifestPanel
              model={manifest}
              integrityOpen={
                integrity.state === "done"
                  ? integrity.findings.filter(
                      (f) => !integrity.acknowledged.has(f.key),
                    ).length
                  : null
              }
            />
          </>
        );
      case "results":
        return (
          <ResultsPane
            tab={tab}
            arranged={arranged}
            folder={folder}
            editing={editing}
            onAddResults={(experimentFolder) =>
              dispatchPanes({
                type: "open",
                tab: {
                  id: addResultTabId(experimentFolder),
                  kind: "addResult",
                  experimentFolder,
                },
              })
            }
          />
        );
      case "addResult":
        return (
          <AddResultPane
            tab={tab}
            arranged={arranged}
            folder={folder}
            editing={editing}
          />
        );
      case "details":
        return (
          <DetailsPanel
            selected={selected}
            questions={questions}
            sharedRefs={shared}
            actions={actions}
            disabled={disabled}
            writable={writable}
            onOpenResult={editing.onOpenResult}
            focusSection={focusSection}
            live={live}
          />
        );
      case "result":
        return (
          <ResultPane
            tab={tab}
            arranged={arranged}
            folder={folder}
            projectId={projectId}
            references={references}
            editing={editing}
            readOnly={!writable}
          />
        );
      default:
        return assertNever(tab);
    }
  }

  return (
    <CitationActionsProvider value={citationActions}>
      <section className="workspace" aria-labelledby="notebook-heading">
        <Ribbon
          projectControls={projectControls}
          writable={writable}
          disabled={disabled}
          actions={actions}
          selected={selected}
          questions={questions}
          filter={filter}
          onFilter={setFilter}
          sort={sort}
          onSort={setSort}
          layout={layout}
          onHide={(key, hidden) =>
            actions.changeSettings({ hidden: { [key]: hidden } })
          }
          onWidth={(key, width) =>
            actions.changeSettings(
              { widths: { [key]: width } },
              { immediate: true },
            )
          }
          onReset={() => actions.resetColumns()}
          onCollapseAll={collapseAll}
          onAddResult={addResult}
          openTabs={new Set(panes.tabs.map((tab) => tab.id))}
          onOpenPane={(tab) => dispatchPanes({ type: "open", tab })}
        />
        <div className="workspace__banners">
          <h2 id="notebook-heading" className="wtable__sr">
            {messages.heading}
          </h2>
          {projectBanners}
          {!writable && <p className="notebook__note">{messages.readOnly}</p>}
          <div role="status" aria-live="polite">
            {busy && (
              <p>
                <span className="spinner" aria-hidden="true" />
                {messages.working}
              </p>
            )}
            {notice !== null && (
              <p className="notebook__notice notice">
                <span>{notice}</span>
                <button
                  type="button"
                  className="notice__dismiss"
                  aria-label={messages.dismiss}
                  onClick={() => actions.dismissNotice()}
                >
                  ×
                </button>
              </p>
            )}
            {failure !== null && <p className="notebook__notice">{failure}</p>}
            {view.status === "loading" && <p>{messages.loading}</p>}
          </div>
          {arranged !== null && (
            <>
              <LiteraturePrompt literature={literature} />
              {arranged.problems.length > 0 && (
                <details className="notebook__problems-box">
                  <summary>
                    {ribbonMessages.problems(arranged.problems.length)}
                  </summary>
                  <h4 id="notebook-problems">{messages.problemsHeading}</h4>
                  <ul className="notebook__problems">
                    {arranged.problems.map((problem, index) => (
                      <li key={`${problem.kind}-${index}`}>
                        {problemMessage(problem)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {invalidInboxRequests.length > 0 && (
                <details className="notebook__problems-box">
                  <summary>{messages.inboxHeading}</summary>
                  <ul className="notebook__problems">
                    {invalidInboxRequests.map((item) => (
                      <li key={item.request}>
                        {inboxRequestMessage(item.reason)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
        {arranged !== null && (
          <div className="workspace__main">
            <div className="workspace__table">
              {rows.length === 0 ? (
                <p className="workspace__empty">{messages.empty}</p>
              ) : (
                <WorkspaceTable
                  rows={rows}
                  layout={layout}
                  selectedKey={selectedKey}
                  pickedKey={pickedKey}
                  sharedRefs={shared}
                  folder={folder}
                  onSelectExperiment={(row) => select(row.key)}
                  onSelectQuestion={(row) => select(row.key)}
                  onToggle={toggle}
                  onResize={resize}
                  editing={editing}
                  {...(viewportHeight === undefined ? {} : { viewportHeight })}
                />
              )}
            </div>
            <PaneHost
              state={panes}
              dispatch={dispatchPanes}
              titleOf={titleOf}
              iconOf={iconOf}
            >
              {paneContent}
            </PaneHost>
          </div>
        )}
        {arranged !== null && (
          <BibliographyPanel
            citekeys={citedSources}
            target={bibliographyTarget}
            onShowDetails={(citekey) => {
              dispatchPanes({
                type: "open",
                tab: { id: "sources", kind: "sources" },
              });
              sources.select(citekey);
            }}
          />
        )}
      </section>
    </CitationActionsProvider>
  );
}
