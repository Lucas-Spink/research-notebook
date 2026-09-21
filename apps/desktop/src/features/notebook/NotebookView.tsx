import type { ColumnKey, Problem } from "@research-notebook/format";
import { useMemo, useState } from "react";
import { DetailsPanel, type Selected } from "./DetailsPanel";
import type { QuestionChoice } from "./ExperimentItem";
import { messages, problemMessage } from "./messages";
import { NewTitleForm } from "./NewTitleForm";
import { columnLayout } from "./table/model/columns";
import {
  UNASSIGNED_KEY,
  buildRows,
  type FilterState,
  type HeaderRow,
  type SortState,
} from "./table/model/rows";
import { TableToolbar } from "./table/TableToolbar";
import { WorkspaceTable } from "./table/WorkspaceTable";
import type { NotebookModel } from "./useNotebook";
import "./NotebookPanel.css";

const NO_FILTER: FilterState = { text: "", status: "all" };

/** The refs that two or more files of one kind hold, so each can be flagged where it is shown. */
function sharedRefs(problems: readonly Problem[]): ReadonlySet<string> {
  return new Set(
    problems.flatMap((p) => (p.kind === "duplicateRef" ? [p.ref] : [])),
  );
}

/**
 * The open project's questions and experiments as a table (FR-TBL-01 to
 * FR-TBL-05, FR-TBL-10) with the tools to change them below it. It renders
 * what `useNotebook` holds and asks it to act; it does no I/O. Filter, sort
 * and the selection are only what the person is looking at, so they are not
 * saved anywhere.
 */
export function NotebookView({
  notebook,
  viewportHeight,
}: {
  notebook: NotebookModel;
  /** Height of the table's window before it is measured. Only tests set it. */
  viewportHeight?: number;
}) {
  const {
    view,
    arranged,
    table,
    unassignedCollapsed,
    busy,
    writable,
    notice,
    failure,
    actions,
  } = notebook;
  const disabled = busy || !writable;
  const [filter, setFilter] = useState<FilterState>(NO_FILTER);
  const [sort, setSort] = useState<SortState>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

  // What is selected is looked up each time, so a deleted item just stops being selected.
  const selected: Selected | null = useMemo(() => {
    if (selectedKey === null || arranged === null) return null;
    const group = arranged.questions.find(
      (q) => `question:${q.question.fileName}` === selectedKey,
    );
    if (group !== undefined) return { kind: "question", group };
    const groups = [
      ...arranged.questions.map((q) => q.experiments),
      arranged.unassigned,
    ];
    for (const items of groups) {
      const item = items.find(
        (i) => `experiment:${i.experiment.folder}` === selectedKey,
      );
      if (item !== undefined) return { kind: "experiment", item };
    }
    return null;
  }, [selectedKey, arranged]);

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

  return (
    <section className="notebook" aria-labelledby="notebook-heading">
      <h3 id="notebook-heading">{messages.heading}</h3>
      {!writable && <p className="notebook__note">{messages.readOnly}</p>}
      <div role="status" aria-live="polite">
        {busy && <p>{messages.working}</p>}
        {notice !== null && <p className="notebook__notice">{notice}</p>}
        {failure !== null && <p className="notebook__notice">{failure}</p>}
        {view.status === "loading" && <p>{messages.loading}</p>}
      </div>
      {arranged !== null && (
        <>
          <TableToolbar
            filter={filter}
            onFilter={setFilter}
            sort={sort}
            onSort={setSort}
            layout={layout}
            writable={writable}
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
          />
          {arranged.problems.length > 0 && (
            <section aria-labelledby="notebook-problems">
              <h4 id="notebook-problems">{messages.problemsHeading}</h4>
              <ul className="notebook__problems">
                {arranged.problems.map((problem, index) => (
                  <li key={`${problem.kind}-${index}`}>
                    {problemMessage(problem)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {rows.length === 0 ? (
            <p>{messages.empty}</p>
          ) : (
            <WorkspaceTable
              rows={rows}
              layout={layout}
              selectedKey={selectedKey}
              sharedRefs={shared}
              onSelectExperiment={(row) => setSelectedKey(row.key)}
              onSelectQuestion={(row) => setSelectedKey(row.key)}
              onToggle={toggle}
              onResize={resize}
              {...(viewportHeight === undefined ? {} : { viewportHeight })}
            />
          )}
          <DetailsPanel
            selected={selected}
            questions={questions}
            sharedRefs={shared}
            actions={actions}
            disabled={disabled}
          />
          <NewTitleForm
            label={messages.newQuestionLabel}
            placeholder={messages.newQuestionPlaceholder}
            submitLabel={messages.addQuestion}
            disabled={disabled}
            onSubmit={(title) => actions.createQuestion(title)}
          />
        </>
      )}
    </section>
  );
}
