import type { ColumnKey } from "@research-notebook/format";
import {
  columnOrderingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  defaultRangeExtractor,
  measureElement,
  useVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { tableMessages } from "../messages";
import { ColumnHeadings } from "./ColumnHeadings";
import type { TableEditing } from "./EditableSectionCell";
import {
  EXPERIMENT_COLUMN_WIDTH,
  gridColumns,
  gridWidth,
  motivationColumn,
  spareShares,
  type ColumnLayout,
} from "./model/columns";
import { withPinned } from "./model/pinned";
import type { ExperimentRow, HeaderRow, TableRow } from "./model/rows";
import {
  EmptyRowView,
  ExperimentRowView,
  QuestionHeaderRowView,
} from "./TableRows";
import { useElementWidth } from "./useElementWidth";
import { useGridFocus } from "./useGridFocus";
import "./WorkspaceTable.css";

const features = tableFeatures({
  columnSizingFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
});
const columnHelper = createColumnHelper<typeof features, ExperimentRow>();

/**
 * Rows are at least these heights and grow to fit their wrapped content, so
 * no cell is truncated (S6-T01). Each row drawn is measured by the
 * virtualiser; unmeasured rows are estimated at these heights, so scrolling
 * still only mounts the rows in view (FR-TBL-10).
 */
const COLUMN_HEADER_HEIGHT = 40;
const QUESTION_ROW_HEIGHT = 64;
const EXPERIMENT_ROW_HEIGHT = 112;
const EMPTY_ROW_HEIGHT = 40;
/** The number of rows drawn before the window is measured, and beyond it while scrolling. */
const INITIAL_VIEWPORT_HEIGHT = 720;
const OVERSCAN = 8;

/** The size of a measured row; a row that has no layout yet (zero) keeps its estimate. */
function measuredSize(
  element: Element,
  entry: ResizeObserverEntry | undefined,
  instance: Virtualizer<HTMLDivElement, Element>,
): number {
  const size = measureElement(element, entry, instance);
  if (size > 0) return size;
  const index = Number(element.getAttribute("data-index"));
  return instance.options.estimateSize(index);
}

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
  /** The row picked on purpose, by its title or header, which alone is highlighted; choosing a cell does not highlight its row. */
  pickedKey: string | null;
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
  /** Editing sections in their cells (FR-TBL-11). */
  editing: TableEditing;
  /** Height of the window before it is measured. Only tests set it. */
  viewportHeight?: number;
};

/** The least height of a row of this kind, and the estimate before it is measured. */
function estimateFor(kind: TableRow["kind"] | undefined): number {
  if (kind === "header") return QUESTION_ROW_HEIGHT;
  return kind === "empty" ? EMPTY_ROW_HEIGHT : EXPERIMENT_ROW_HEIGHT;
}

/** The index of the row open in the table, if any: grown to fit, and kept rendered. */
function editedRow(
  rows: readonly TableRow[],
  editing: TableEditing,
): number | null {
  // The row whose section is being edited in its cell (ADR-0043).
  const target = editing.live.target;
  const folder =
    target !== null && target.surface === "table" ? target.folder : null;
  if (folder === null) return null;
  const index = rows.findIndex(
    (row) => row.kind === "experiment" && row.item.experiment.folder === folder,
  );
  return index === -1 ? null : index;
}

/**
 * The workspace table (FR-TBL-01 to FR-TBL-05, FR-TBL-10, FR-TBL-11): a
 * header row per question, an experiment row under it, line-clamped
 * summaries that open for editing in place, and only the rows in view
 * mounted. TanStack Table holds the column model (order, visibility, size);
 * TanStack Virtual holds the window of rows. The row being edited is the one
 * row measured, and is always rendered, even out of view, so its editor is
 * never unmounted by scrolling (ADR-0043). The scroll area takes keyboard
 * focus so arrow keys and Page Up and Down scroll it, which is also how a
 * row not yet mounted is reached.
 */
export function WorkspaceTable({
  rows,
  layout,
  selectedKey,
  pickedKey,
  sharedRefs,
  folder,
  onSelectExperiment,
  onSelectQuestion,
  onToggle,
  onResize,
  editing,
  viewportHeight = INITIAL_VIEWPORT_HEIGHT,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
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
  // Spare window width goes to the section columns (FR-TBL-12). Shares come
  // from the saved widths, so they hold still while an edge is dragged and
  // the dragged edge follows the pointer; the stored width stays what a
  // resize handle reads and changes.
  const available = useElementWidth(scrollRef);
  const shares = useMemo(
    () => spareShares(gridColumns(layout), available),
    [layout, available],
  );
  const cells = gridColumns(shown).map((column) => ({
    ...column,
    stored: column.width,
    width: column.width + (shares.get(column.key) ?? 0),
  }));
  const total = gridWidth(cells);
  const motivation = motivationColumn(shown);

  const edited = editedRow(rows, editing);
  const focus = useGridFocus({
    rows,
    colCount: cells.length + 1,
    grid: gridRef,
    scrollToIndex: (index) =>
      virtualizer.scrollToIndex(index, { align: "auto" }),
    closeEditor: () => editing.live.activate(null),
  });
  const pinned = [edited, focus.rowIndex].filter((index) => index !== null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateFor(rows[index]?.kind),
    measureElement: measuredSize,
    getItemKey: (index) => rows[index]?.key ?? index,
    rangeExtractor: (range) => withPinned(defaultRangeExtractor(range), pinned),
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
        ref={gridRef}
        role="grid"
        aria-label={tableMessages.tableLabel}
        onKeyDown={focus.onKeyDown}
        onFocus={focus.onFocus}
        aria-rowcount={rows.length + 1}
        aria-colcount={cells.length + 1}
        style={{ width: total }}
      >
        <ColumnHeadings
          height={COLUMN_HEADER_HEIGHT}
          experimentWidth={experimentWidth}
          columns={cells}
          onLive={(key, width) =>
            setLive(width === null ? null : { key, width })
          }
          onCommit={onResize}
        />
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
                minHeight: estimateFor(row.kind),
                transform: `translateY(${item.start - COLUMN_HEADER_HEIGHT}px)`,
              },
              measure: {
                ref: virtualizer.measureElement,
                dataIndex: item.index,
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
                  picked={pickedKey === row.key}
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
                picked={pickedKey === row.key}
                sharesRef={sharedRefs.has(
                  row.item.experiment.file.frontmatter.ref,
                )}
                folder={folder}
                onSelect={onSelectExperiment}
                editing={editing}
                selectedCol={
                  focus.selected?.rowKey === row.key ? focus.selected.col : null
                }
                focusCol={
                  focus.cell?.rowKey === row.key ? focus.cell.col : null
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
