import type { CanvasFileModel } from "@research-notebook/format";
import { artefactNodes, type ArtefactNode } from "./nodes";
import { noteNodes } from "./notes";
import { tableNodes, type TableCell } from "./tables";
import type { ResultInfo } from "./results";

/** A figure a note refers to: the card it is joined to, and what that card points at now. */
export type FigureRef = {
  /** The first card of this figure joined to the note, which a click selects. */
  nodeId: string;
  info: ResultInfo;
  /** Set when the figure is in a table cell: the headings of its row and column. */
  cell?: { row: string; column: string };
};

/** One note of the summary. */
export type NoteSummary = {
  id: string;
  text: string;
  /** The figures it is joined to, each once, in the order the lines were drawn. */
  figures: FigureRef[];
  /** The other notes it is joined to. */
  notes: { id: string; text: string }[];
  /** Tables it is joined to as a whole, not at a cell; left out when there are none. */
  tables?: { nodeId: string; rows: number; columns: number }[];
};

/** The same figure however many cards show it: the result and the version shown. */
function sameFigure(info: ResultInfo, node: ArtefactNode): string {
  return info.status === "found"
    ? `${info.experimentFolder}:${info.artefactId}:${info.shownVersion ?? "-"}`
    : `missing:${node.experiment_id}:${node.artefact_id}:${node.version ?? "-"}`;
}

/**
 * The summary of a question's canvas (ADR-0065): each note, in the order it
 * reads down the canvas, with the figures and notes its lines join it to. A
 * line is read from either end. It is worked out from the canvas each time and
 * stored nowhere, so it cannot disagree with the lines.
 */
export function summarise(
  file: CanvasFileModel,
  resolve: (node: ArtefactNode) => ResultInfo,
): NoteSummary[] {
  const figures = new Map(artefactNodes(file).map((node) => [node.id, node]));
  const notes = new Map(noteNodes(file).map((node) => [node.id, node]));
  const tables = new Map(tableNodes(file).map((node) => [node.id, node]));
  return [...notes.values()]
    .sort(
      (a, b) =>
        a.position.y - b.position.y ||
        a.position.x - b.position.x ||
        a.id.localeCompare(b.id),
    )
    .map((note) => {
      const seen = new Set<string>();
      const referred: FigureRef[] = [];
      const related: { id: string; text: string }[] = [];
      const wholeTables: NonNullable<NoteSummary["tables"]> = [];
      for (const edge of file.edges) {
        const other =
          edge.source === note.id
            ? edge.target
            : edge.target === note.id
              ? edge.source
              : null;
        if (other === null) continue;
        const figure = figures.get(other);
        if (figure !== undefined) {
          const info = resolve(figure);
          const key = sameFigure(info, figure);
          if (!seen.has(key)) {
            seen.add(key);
            referred.push({ nodeId: figure.id, info });
          }
          continue;
        }
        const table = tables.get(other);
        if (table !== undefined) {
          const at =
            edge.source === note.id ? edge.target_cell : edge.source_cell;
          if (at === undefined) {
            if (!wholeTables.some((t) => t.nodeId === table.id)) {
              wholeTables.push({
                nodeId: table.id,
                rows: table.rows.length,
                columns: table.columns.length,
              });
            }
            continue;
          }
          const cell = table.cells.find(
            (c) => c.row === at.row && c.column === at.column,
          );
          const row = table.rows.find((x) => x.id === at.row);
          const column = table.columns.find((x) => x.id === at.column);
          if (cell === undefined || row === undefined || column === undefined) {
            continue;
          }
          const node = cellFigure(cell);
          const info = resolve(node);
          const key = sameFigure(info, node);
          if (!seen.has(key)) {
            seen.add(key);
            referred.push({
              nodeId: table.id,
              info,
              cell: { row: row.label, column: column.label },
            });
          }
          continue;
        }
        const next = notes.get(other);
        if (next !== undefined) related.push({ id: next.id, text: next.text });
      }
      return {
        id: note.id,
        text: note.text,
        figures: referred,
        notes: related,
        ...(wholeTables.length === 0 ? {} : { tables: wholeTables }),
      };
    });
}

/** A table cell as the figure card the rest of the canvas reads results through. */
const cellFigure = (cell: TableCell): ArtefactNode => ({
  id: `${cell.row}/${cell.column}`,
  type: "artefact",
  experiment_id: cell.experiment_id,
  artefact_id: cell.artefact_id,
  ...(cell.version === undefined ? {} : { version: cell.version }),
  position: { x: 0, y: 0 },
  size: { width: 1, height: 1 },
});

/** A table as the summary reads it: its headings and, for each row, what is in each cell (null: empty). */
export type TableSummary = {
  id: string;
  columns: string[];
  rows: { label: string; cells: (ResultInfo | null)[] }[];
};

/** The tables of a canvas, in the order they read down it, worked out from the canvas each time. */
export function summariseTables(
  file: CanvasFileModel,
  resolve: (node: ArtefactNode) => ResultInfo,
): TableSummary[] {
  return tableNodes(file)
    .sort(
      (a, b) =>
        a.position.y - b.position.y ||
        a.position.x - b.position.x ||
        a.id.localeCompare(b.id),
    )
    .map((table) => ({
      id: table.id,
      columns: table.columns.map((c) => c.label),
      rows: table.rows.map((row) => ({
        label: row.label,
        cells: table.columns.map((column) => {
          const cell = table.cells.find(
            (c) => c.row === row.id && c.column === column.id,
          );
          return cell === undefined ? null : resolve(cellFigure(cell));
        }),
      })),
    }));
}
