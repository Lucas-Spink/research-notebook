import { NodeResizeControl, type NodeProps } from "@xyflow/react";
import { memo, useState, type CSSProperties, type SyntheticEvent } from "react";
import { CardHandles } from "./CardHandles";
import { useCard } from "./CardContext";
import { canvasMessages as m } from "./messages";
import type { TableFlowNode } from "./model/flowNodes";
import {
  COLUMN_HEADER_HEIGHT,
  MIN_TABLE_WIDTH,
  ROW_HEADER_WIDTH,
} from "./model/tables";
import type { PictureDetail, ResultInfo } from "./model/results";

/** A cell this wide on screen, in pixels, shows its picture from the file; narrower ones are drawn from the thumbnail. */
const FULL_ABOVE = 200;

/** A heading the person edits in place: saved when they leave it or press Enter, and put back if left empty. */
function HeadingInput({
  label,
  editable,
  describe,
  onSave,
}: {
  label: string;
  editable: boolean;
  describe: string;
  onSave: (label: string) => void;
}) {
  const [text, setText] = useState(label);
  // A heading changed elsewhere (undo, another window) replaces what is shown.
  const [shown, setShown] = useState(label);
  if (shown !== label) {
    setShown(label);
    setText(label);
  }
  const commit = () => {
    const next = text.trim();
    if (next === "" || next === label) {
      setText(label);
      return;
    }
    onSave(next);
  };
  return (
    <input
      className="canvas-table__heading nodrag nopan nowheel"
      aria-label={describe}
      value={text}
      readOnly={!editable}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setText(label);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * A table of figures on the canvas (ADR-0071): headings along the top and
 * down the side, and a result in each cell. A result dragged from the Results
 * list onto a cell fills it. The cells take the shape of the pictures in
 * them, so identical figures in a line fill their cells with no empty space.
 */
function TableCardView({ data, selected }: NodeProps<TableFlowNode>) {
  const { editable, onRemove, onTable, newId, services } = useCard();
  const { node, layout, infos } = data;
  const [confirming, setConfirming] = useState(false);
  const columnTemplate = [ROW_HEADER_WIDTH, ...layout.columnWidths]
    .map((w) => `${w}px`)
    .join(" ");
  const rowTemplate = [COLUMN_HEADER_HEIGHT, ...layout.rowHeights]
    .map((h) => `${h}px`)
    .join(" ");
  const grid: CSSProperties = {
    gridTemplateColumns: columnTemplate,
    gridTemplateRows: rowTemplate,
  };
  const columnNumber = (id: string) =>
    node.columns.findIndex((c) => c.id === id) + 1;

  const onPictureLoad =
    (row: string, column: string) => (event: SyntheticEvent) => {
      const image = event.target;
      if (!editable || !(image instanceof HTMLImageElement)) return;
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      onTable(node.id, {
        kind: "aspect",
        row,
        column,
        aspect: image.naturalWidth / image.naturalHeight,
      });
    };

  return (
    <>
      {/* Only the width is the person's to set: the height follows from the pictures. */}
      {selected && editable && (
        <NodeResizeControl
          position="right"
          resizeDirection="horizontal"
          minWidth={MIN_TABLE_WIDTH}
          className="canvas-resize-handle"
        />
      )}
      <div className="canvas-table" role="group" aria-label={m.tableLabel}>
        <div className="canvas-table__bar">
          {editable && (
            <>
              <button
                type="button"
                className="nodrag nopan"
                onClick={() =>
                  onTable(node.id, {
                    kind: "addRow",
                    id: newId(),
                    label: m.tableRowLabel(node.rows.length + 1),
                  })
                }
              >
                {m.addRow}
              </button>
              <button
                type="button"
                className="nodrag nopan"
                onClick={() =>
                  onTable(node.id, {
                    kind: "addColumn",
                    id: newId(),
                    label: m.tableColumnLabel(node.columns.length + 1),
                  })
                }
              >
                {m.addColumn}
              </button>
              <label className="canvas-table__fit nodrag nopan">
                <span>{m.cellShape}</span>
                <select
                  value={node.fit}
                  onChange={(event) =>
                    onTable(node.id, {
                      kind: "fit",
                      fit: event.target.value === "column" ? "column" : "row",
                    })
                  }
                >
                  <option value="row">{m.fitByRow}</option>
                  <option value="column">{m.fitByColumn}</option>
                </select>
              </label>
              <span className="canvas-table__spacer" />
              {confirming ? (
                <>
                  <button
                    type="button"
                    className="nodrag nopan"
                    onClick={() => onRemove(node.id)}
                  >
                    {m.removeTableConfirm}
                  </button>
                  <button
                    type="button"
                    className="nodrag nopan"
                    onClick={() => setConfirming(false)}
                  >
                    {m.keepTable}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="nodrag nopan"
                  aria-label={m.removeTable}
                  title={m.removeTable}
                  onClick={() =>
                    node.cells.length === 0
                      ? onRemove(node.id)
                      : setConfirming(true)
                  }
                >
                  ×
                </button>
              )}
            </>
          )}
        </div>
        <div className="canvas-table__grid" style={grid}>
          <div className="canvas-table__corner" />
          {node.columns.map((column) => (
            <div key={column.id} className="canvas-table__head">
              <HeadingInput
                label={column.label}
                editable={editable}
                describe={m.columnHeading(columnNumber(column.id))}
                onSave={(label) =>
                  onTable(node.id, {
                    kind: "heading",
                    line: "column",
                    id: column.id,
                    label,
                  })
                }
              />
              {editable && (
                <button
                  type="button"
                  className="nodrag nopan"
                  aria-label={m.removeColumn(column.label)}
                  title={m.removeColumn(column.label)}
                  onClick={() =>
                    onTable(node.id, { kind: "removeColumn", id: column.id })
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {node.rows.map((row, r) => (
            <RowCells
              key={row.id}
              row={row}
              columns={node.columns}
              rowNumber={r + 1}
              editable={editable}
              tableId={node.id}
              cells={node.cells}
              infos={infos}
              columnWidths={layout.columnWidths}
              renderPreview={services.renderPreview}
              onOpen={(info, cell) =>
                services.onOpen(info, {
                  id: `${cell.row}/${cell.column}`,
                  type: "artefact",
                  experiment_id: cell.experiment_id,
                  artefact_id: cell.artefact_id,
                  ...(cell.version === undefined
                    ? {}
                    : { version: cell.version }),
                  position: { x: 0, y: 0 },
                  size: { width: 1, height: 1 },
                })
              }
              onTable={onTable}
              onPictureLoad={onPictureLoad}
            />
          ))}
        </div>
        <CardHandles />
      </div>
    </>
  );
}

type RowProps = {
  row: { id: string; label: string };
  columns: { id: string; label: string }[];
  rowNumber: number;
  editable: boolean;
  tableId: string;
  cells: TableFlowNode["data"]["node"]["cells"];
  infos: TableFlowNode["data"]["infos"];
  columnWidths: number[];
  renderPreview: (
    info: Extract<ResultInfo, { status: "found" }>,
    detail: PictureDetail,
  ) => React.ReactNode;
  onOpen: (
    info: Extract<ResultInfo, { status: "found" }>,
    cell: TableFlowNode["data"]["node"]["cells"][number],
  ) => void;
  onTable: ReturnType<typeof useCard>["onTable"];
  onPictureLoad: (
    row: string,
    column: string,
  ) => (event: SyntheticEvent) => void;
};

/** One row of the table: its heading, then a cell for each column. */
function RowCells({
  row,
  columns,
  rowNumber,
  editable,
  tableId,
  cells,
  infos,
  columnWidths,
  renderPreview,
  onOpen,
  onTable,
  onPictureLoad,
}: RowProps) {
  return (
    <>
      <div className="canvas-table__head canvas-table__head--row">
        <HeadingInput
          label={row.label}
          editable={editable}
          describe={m.rowHeading(rowNumber)}
          onSave={(label) =>
            onTable(tableId, {
              kind: "heading",
              line: "row",
              id: row.id,
              label,
            })
          }
        />
        {editable && (
          <button
            type="button"
            className="nodrag nopan"
            aria-label={m.removeRow(row.label)}
            title={m.removeRow(row.label)}
            onClick={() => onTable(tableId, { kind: "removeRow", id: row.id })}
          >
            ×
          </button>
        )}
      </div>
      {columns.map((column, c) => {
        const cell = cells.find(
          (x) => x.row === row.id && x.column === column.id,
        );
        const info =
          cell === undefined ? undefined : infos[`${row.id}/${column.id}`];
        const wide = (columnWidths[c] ?? 0) > FULL_ABOVE;
        return (
          <div
            key={column.id}
            className="canvas-table__cell"
            data-table-cell=""
            data-table={tableId}
            data-row={row.id}
            data-column={column.id}
            aria-label={m.cellLabel(rowNumber, c + 1)}
            onLoadCapture={onPictureLoad(row.id, column.id)}
          >
            {cell === undefined ? (
              <span className="canvas-table__empty">{m.dropHere}</span>
            ) : info?.status === "found" ? (
              <>
                {renderPreview(info, wide ? "full" : "thumbnail")}
                <span className="canvas-table__cell-actions nodrag nopan">
                  <button
                    type="button"
                    aria-label={m.openOriginal(info.name)}
                    title={m.openOriginal(info.name)}
                    onClick={() => onOpen(info, cell)}
                  >
                    ↗
                  </button>
                  {editable && (
                    <button
                      type="button"
                      aria-label={m.clearCell}
                      title={m.clearCell}
                      onClick={() =>
                        onTable(tableId, {
                          kind: "clearCell",
                          row: row.id,
                          column: column.id,
                        })
                      }
                    >
                      ×
                    </button>
                  )}
                </span>
              </>
            ) : (
              <span className="canvas-table__empty">
                {m.missingCell}
                {editable && (
                  <button
                    type="button"
                    className="nodrag nopan"
                    onClick={() =>
                      onTable(tableId, {
                        kind: "clearCell",
                        row: row.id,
                        column: column.id,
                      })
                    }
                  >
                    {m.clearCell}
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

export const TableCard = memo(TableCardView);
