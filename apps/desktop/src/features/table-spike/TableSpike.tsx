import { useMemo, useRef } from "react";
import {
  createColumnHelper,
  flexRender,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { buildTableRows, type TableRow } from "./model/buildTableRows";
import {
  createRandom,
  generateExperiments,
  type ExperimentRow,
} from "./model/generateExperiments";
import "./TableSpike.css";

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, ExperimentRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("ref", {
    header: "Ref",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("title", {
    header: "Experiment",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("methods", {
    header: "Methods",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("results", {
    header: "Results",
    cell: (info) =>
      `${info.row.original.resultThumbnailCount} thumbnails — ${info.getValue()}`,
  }),
  columnHelper.accessor("resultsNotes", {
    header: "Results notes",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("interpretation", {
    header: "Interpretation",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("literature", {
    header: "Literature",
    cell: (info) => info.getValue(),
  }),
]);

const HEADER_ROW_HEIGHT = 56;
const EXPERIMENT_ROW_HEIGHT = 88;

/**
 * S1-T07 spike evidence: 500 generated experiments under full-width question
 * header rows, rendered read-only and virtualised (spec 7.3, ADR-0005, gate
 * S1-G08).
 */
function TableSpike() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { questions, experiments } = useMemo(
    () => generateExperiments(createRandom(20260918)),
    [],
  );
  const tableRows = useMemo(
    () => buildTableRows(questions, experiments),
    [questions, experiments],
  );

  const table = useTable({
    features,
    data: experiments,
    columns,
    getRowId: (experiment) => experiment.id,
  });

  const rowsById = table.getRowModel().rowsById;
  const headerGroup = table.getHeaderGroups()[0];

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      tableRows[index]?.type === "question-header"
        ? HEADER_ROW_HEIGHT
        : EXPERIMENT_ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <section className="table-spike">
      <p className="table-spike__caption">
        {experiments.length} generated experiments across {questions.length}{" "}
        questions, virtualised
      </p>

      {headerGroup && (
        <div className="table-spike__column-headers" role="row">
          {headerGroup.headers.map((header) => (
            <span
              key={header.id}
              className="table-spike__column-header"
              role="columnheader"
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
            </span>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="table-spike__scroll" role="table">
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const tableRow: TableRow | undefined = tableRows[virtualRow.index];
            if (!tableRow) return null;

            const style = {
              position: "absolute" as const,
              top: 0,
              left: 0,
              width: "100%",
              height: virtualRow.size,
              transform: `translateY(${virtualRow.start}px)`,
            };

            if (tableRow.type === "question-header") {
              return (
                <div
                  key={virtualRow.key}
                  style={style}
                  className="table-spike__question-header"
                  role="row"
                >
                  <button
                    type="button"
                    className="table-spike__collapse"
                    aria-label="Collapse question"
                  >
                    ▾
                  </button>
                  <strong>{tableRow.question.title}</strong>
                  <span className="table-spike__motivation">
                    {tableRow.question.motivation}
                  </span>
                  <span className="table-spike__count">
                    {tableRow.experimentCount} of {tableRow.experimentCount}
                  </span>
                </div>
              );
            }

            const row = rowsById[tableRow.experiment.id];
            if (!row) return null;

            return (
              <div
                key={virtualRow.key}
                style={style}
                className="table-spike__row"
                role="row"
              >
                {row.getAllCells().map((cell) => (
                  <span key={cell.id} className="table-spike__cell" role="cell">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default TableSpike;
