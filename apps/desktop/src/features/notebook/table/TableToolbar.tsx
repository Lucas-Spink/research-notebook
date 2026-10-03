import { useId } from "react";
import { statusLabel, statusOptions, tableMessages } from "../messages";
import type { FilterState, SortColumn, SortState } from "./model/rows";

const SORT_OPTIONS: { column: SortColumn; label: string }[] = [
  { column: "ref", label: tableMessages.sortRef },
  { column: "title", label: tableMessages.sortTitle },
  { column: "status", label: tableMessages.sortStatus },
  { column: "started", label: tableMessages.sortStarted },
  { column: "completed", label: tableMessages.sortCompleted },
];

type FilterProps = {
  filter: FilterState;
  onFilter: (filter: FilterState) => void;
};

/** The text and status filters (FR-TBL-03), ordinary form controls so they work by keyboard. */
export function FilterControls({ filter, onFilter }: FilterProps) {
  const ids = useId();
  return (
    <div className="notebook__toolbar" role="search">
      <label htmlFor={`${ids}-filter`}>{tableMessages.filterLabel}</label>
      <input
        id={`${ids}-filter`}
        type="search"
        value={filter.text}
        placeholder={tableMessages.filterPlaceholder}
        onChange={(event) => onFilter({ ...filter, text: event.target.value })}
      />
      <label htmlFor={`${ids}-status`}>{tableMessages.statusFilterLabel}</label>
      <select
        id={`${ids}-status`}
        value={filter.status}
        onChange={(event) => {
          const chosen = statusOptions.find((s) => s === event.target.value);
          onFilter({ ...filter, status: chosen ?? "all" });
        }}
      >
        <option value="all">{tableMessages.allStatuses}</option>
        {statusOptions.map((option) => (
          <option key={option} value={option}>
            {statusLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

type SortProps = {
  sort: SortState;
  onSort: (sort: SortState) => void;
};

/** The sort column and direction (FR-TBL-04). */
export function SortControls({ sort, onSort }: SortProps) {
  const id = useId();
  return (
    <div className="notebook__toolbar">
      <label htmlFor={id}>{tableMessages.sortLabel}</label>
      <select
        id={id}
        value={sort?.column ?? "none"}
        onChange={(event) => {
          const chosen = SORT_OPTIONS.find(
            (o) => o.column === event.target.value,
          );
          onSort(
            chosen === undefined
              ? null
              : { column: chosen.column, direction: sort?.direction ?? "asc" },
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
    </div>
  );
}
