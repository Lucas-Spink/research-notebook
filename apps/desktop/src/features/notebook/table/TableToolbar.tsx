import type { ColumnKey } from "@research-notebook/format";
import { useId, useState } from "react";
import { statusLabel, statusOptions, tableMessages } from "../messages";
import { ColumnsMenu } from "./ColumnsMenu";
import type { ColumnLayout } from "./model/columns";
import type { FilterState, SortColumn, SortState } from "./model/rows";

const SORT_OPTIONS: { column: SortColumn; label: string }[] = [
  { column: "ref", label: tableMessages.sortRef },
  { column: "title", label: tableMessages.sortTitle },
  { column: "status", label: tableMessages.sortStatus },
  { column: "started", label: tableMessages.sortStarted },
  { column: "completed", label: tableMessages.sortCompleted },
];

type Props = {
  filter: FilterState;
  onFilter: (filter: FilterState) => void;
  sort: SortState;
  onSort: (sort: SortState) => void;
  layout: readonly ColumnLayout[];
  writable: boolean;
  onHide: (key: ColumnKey, hidden: boolean) => void;
  onWidth: (key: ColumnKey, width: number) => void;
  onReset: () => void;
};

/** Filter, sort and column controls, all ordinary form controls so they work by keyboard (FR-TBL-03, FR-TBL-04). */
export function TableToolbar({
  filter,
  onFilter,
  sort,
  onSort,
  layout,
  writable,
  onHide,
  onWidth,
  onReset,
}: Props) {
  const ids = useId();
  const [columnsOpen, setColumnsOpen] = useState(false);

  return (
    <>
      <div className="notebook__toolbar" role="search">
        <label htmlFor={`${ids}-filter`}>{tableMessages.filterLabel}</label>
        <input
          id={`${ids}-filter`}
          type="search"
          value={filter.text}
          placeholder={tableMessages.filterPlaceholder}
          onChange={(event) =>
            onFilter({ ...filter, text: event.target.value })
          }
        />
        <label htmlFor={`${ids}-status`}>
          {tableMessages.statusFilterLabel}
        </label>
        <select
          id={`${ids}-status`}
          value={filter.status}
          onChange={(event) => {
            const chosen = statusOptions.find((s) => s === event.target.value);
            onFilter({
              ...filter,
              status: chosen ?? "all",
            });
          }}
        >
          <option value="all">{tableMessages.allStatuses}</option>
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {statusLabel(option)}
            </option>
          ))}
        </select>
        <label htmlFor={`${ids}-sort`}>{tableMessages.sortLabel}</label>
        <select
          id={`${ids}-sort`}
          value={sort?.column ?? "none"}
          onChange={(event) => {
            const chosen = SORT_OPTIONS.find(
              (o) => o.column === event.target.value,
            );
            onSort(
              chosen === undefined
                ? null
                : {
                    column: chosen.column,
                    direction: sort?.direction ?? "asc",
                  },
            );
          }}
        >
          <option value="none">{tableMessages.sortNone}</option>
          {SORT_OPTIONS.map((option) => (
            <option key={option.column} value={option.column}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={sort === null}
          aria-label={tableMessages.changeDirection}
          onClick={() =>
            sort !== null &&
            onSort({
              ...sort,
              direction: sort.direction === "asc" ? "desc" : "asc",
            })
          }
        >
          {sort?.direction === "desc"
            ? tableMessages.descending
            : tableMessages.ascending}
        </button>
        <button
          type="button"
          aria-expanded={columnsOpen}
          onClick={() => setColumnsOpen(!columnsOpen)}
        >
          {tableMessages.columnsButton}
        </button>
      </div>
      {columnsOpen && (
        <ColumnsMenu
          layout={layout}
          writable={writable}
          onHide={onHide}
          onWidth={onWidth}
          onReset={onReset}
        />
      )}
    </>
  );
}
