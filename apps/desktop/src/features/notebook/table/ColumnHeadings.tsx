import type { ColumnKey } from "@research-notebook/format";
import { columnLabel, resizeLabel, tableMessages } from "../messages";
import { ResizeHandle } from "./ResizeHandle";

type Props = {
  height: number;
  experimentWidth: number;
  columns: readonly { key: ColumnKey; width: number }[];
  /** A column edge is being dragged to `width`, or the drag ended (`null`). */
  onLive: (key: ColumnKey, width: number | null) => void;
  onCommit: (
    key: ColumnKey,
    width: number,
    options: { immediate: boolean },
  ) => void;
};

/** The table's heading row: a heading per shown column, each with its resize handle (FR-TBL-04). */
export function ColumnHeadings({
  height,
  experimentWidth,
  columns,
  onLive,
  onCommit,
}: Props) {
  return (
    <div
      role="row"
      aria-rowindex={1}
      className="wtable__columns"
      style={{ height }}
    >
      <div
        role="columnheader"
        className="wtable__heading"
        style={{ width: experimentWidth }}
      >
        {tableMessages.experimentColumn}
      </div>
      {columns.map((column) => (
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
            onLive={(width) => onLive(column.key, width)}
            onCommit={(width, options) => onCommit(column.key, width, options)}
          />
        </div>
      ))}
    </div>
  );
}
