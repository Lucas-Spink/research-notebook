import type { ColumnKey } from "@research-notebook/format";
import {
  columnOrderingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { columnLabel, resizeLabel, tableMessages } from "../messages";
import {
  EXPERIMENT_COLUMN_WIDTH,
  gridColumns,
  gridWidth,
  motivationColumn,
  type ColumnLayout,
} from "./model/columns";
import type { ExperimentRow, HeaderRow, TableRow } from "./model/rows";
import { ResizeHandle } from "./ResizeHandle";
import {
  EmptyRowView,
  ExperimentRowView,
  QuestionHeaderRowView,
} from "./TableRows";
import "./WorkspaceTable.css";

const features = tableFeatures({
  columnSizingFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
});
const columnHelper = createColumnHelper<typeof features, ExperimentRow>();

/** Rows are a fixed height, so scrolling never has to measure them (FR-TBL-10). */
const COLUMN_HEADER_HEIGHT = 40;
const QUESTION_ROW_HEIGHT = 64;
const EXPERIMENT_ROW_HEIGHT = 112;
const EMPTY_ROW_HEIGHT = 40;
/** The number of rows drawn before the window is measured, and beyond it while scrolling. */
const INITIAL_VIEWPORT_HEIGHT = 720;
const OVERSCAN = 8;

const EXPERIMENT = "experiment";
const definitions = columnHelper.columns([
  columnHelper.display({
    id: EXPERIMENT,
    header: tableMessages.experimentColumn,
  }),
  columnHelper.display({ id: "motivation" }),
  columnHelper.display({ id: "methods" }),
  columnHelper.display({ id: "results" }),
  columnHelper.display({ id: "results_notes" }),
  columnHelper.display({ id: "interpretation" }),
  columnHelper.display({ id: "literature" }),
]);
/** No rows are given to TanStack Table: the rows are ours (question headers are not data rows, ADR-0005). */
const NO_DATA: ExperimentRow[] = [];

type Props = {
  rows: readonly TableRow[];
  /** The columns from `project.yaml`, with changes not saved yet applied. */
  layout: readonly ColumnLayout[];
  selectedKey: string | null;
  /** Refs that more than one file holds, to flag where they are shown. */
  sharedRefs: ReadonlySet<string>;
  /** The open project, so a cell's reference chips can read each experiment's artefacts.yaml (FR-EDT-06). */
  folder: FolderHandle;
  onSelectExperiment: (row: ExperimentRow) => void;
  onSelectQuestion: (row: HeaderRow) => void;
  onToggle: (row: HeaderRow) => void;
  onResize: (
    key: ColumnKey,
    width: number,
    options: { immediate: boolean },
  ) => void;
  /** Height of the window before it is measured. Only tests set it. */
  viewportHeight?: number;
};

/**
 * The workspace table (FR-TBL-01 to FR-TBL-05, FR-TBL-10): a header row per
 * question, an experiment row under it, read-only line-clamped cells, and only
 * the rows in view mounted. TanStack Table holds the column model (order,
 * visibility, size); TanStack Virtual holds the window of rows (ADR-0005).
 * The scroll area takes keyboard focus so arrow keys and Page Up and Down
 * scroll it, which is also how a row not yet mounted is reached.
 */
export function WorkspaceTable({
  rows,
  layout,
  selectedKey,
  sharedRefs,
  folder,
  onSelectExperiment,
  onSelectQuestion,
  onToggle,
  onResize,
  viewportHeight = INITIAL_VIEWPORT_HEIGHT,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // The width while a column edge is being dragged; saved only when it ends.
  const [live, setLive] = useState<{ key: ColumnKey; width: number } | null>(
    null,
  );
  const shown = useMemo(
    () =>
      layout.map((c) =>
        live?.key === c.key ? { ...c, width: live.width } : c,
      ),
    [layout, live],
  );

  const table = useTable({
    features,
    columns: definitions,
    data: NO_DATA,
    state: {
      columnOrder: [EXPERIMENT, ...shown.map((c) => c.key)],
      columnSizing: {
        [EXPERIMENT]: EXPERIMENT_COLUMN_WIDTH,
        ...Object.fromEntries(shown.map((c) => [c.key, c.width])),
      },
      // Motivation has no cell in an experiment row, so it is never a grid column.
      columnVisibility: {
        motivation: false,
        ...Object.fromEntries(shown.map((c) => [c.key, !c.hidden])),
      },
    },
  });
  const visible = table.getVisibleLeafColumns();
  const experimentWidth = visible[0]?.getSize() ?? EXPERIMENT_COLUMN_WIDTH;
  const cells = gridColumns(shown);
  const total = gridWidth(cells);
  const motivation = motivationColumn(shown);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const kind = rows[index]?.kind;
      if (kind === "header") return QUESTION_ROW_HEIGHT;
      return kind === "empty" ? EMPTY_ROW_HEIGHT : EXPERIMENT_ROW_HEIGHT;
    },
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: OVERSCAN,
    scrollMargin: COLUMN_HEADER_HEIGHT,
    initialRect: { width: total, height: viewportHeight },
  });

  return (
    <div
      ref={scrollRef}
      className="wtable"
      role="region"
      aria-label={tableMessages.tableLabel}
      tabIndex={0}
    >
      <div
        role="table"
        aria-label={tableMessages.tableLabel}
        aria-rowcount={rows.length + 1}
        aria-colcount={cells.length + 1}
        style={{ width: total }}
      >
        <div
          role="row"
          aria-rowindex={1}
          className="wtable__columns"
          style={{ height: COLUMN_HEADER_HEIGHT }}
        >
          <div
            role="columnheader"
            className="wtable__heading"
            style={{ width: experimentWidth }}
          >
            {tableMessages.experimentColumn}
          </div>
          {cells.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className="wtable__heading"
              style={{ width: column.width }}
            >
              {columnLabel(column.key)}
              <ResizeHandle
                label={resizeLabel(columnLabel(column.key))}
                width={column.width}
                onLive={(width) =>
                  setLive(width === null ? null : { key: column.key, width })
                }
                onCommit={(width, options) =>
                  onResize(column.key, width, options)
                }
              />
            </div>
          ))}
        </div>
        <div
          className="wtable__body"
          style={{ height: virtualizer.getTotalSize() - COLUMN_HEADER_HEIGHT }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (row === undefined) return null;
            const place = {
              index: item.index + 2,
              style: {
                height: item.size,
                transform: `translateY(${item.start - COLUMN_HEADER_HEIGHT}px)`,
              },
            };
            if (row.kind === "header") {
              return (
                <QuestionHeaderRowView
                  key={row.key}
                  row={row}
                  place={place}
                  columnCount={cells.length + 1}
                  motivationWidth={motivation?.width ?? null}
                  selected={selectedKey === row.key}
                  sharesRef={row.ref !== null && sharedRefs.has(row.ref)}
                  onToggle={onToggle}
                  onSelect={onSelectQuestion}
                />
              );
            }
            if (row.kind === "empty") {
              return <EmptyRowView key={row.key} place={place} />;
            }
            return (
              <ExperimentRowView
                key={row.key}
                row={row}
                place={place}
                columns={cells}
                experimentWidth={experimentWidth}
                selected={selectedKey === row.key}
                sharesRef={sharedRefs.has(
                  row.item.experiment.file.frontmatter.ref,
                )}
                folder={folder}
                onSelect={onSelectExperiment}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
