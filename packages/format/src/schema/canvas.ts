import { z } from "zod";
import { SingleLine, Ulid } from "./common";

/**
 * The format version that introduced canvas files (ADR-0064). A canvas file
 * carries its own version so a reader can tell it apart from a version 1
 * project, which never held one.
 */
export const CANVAS_FORMAT_VERSION = 2;

/**
 * The canvas version that adds tables (ADR-0071). A canvas is written at this
 * version only when it holds a table or a line to a table cell; every other
 * canvas stays at `CANVAS_FORMAT_VERSION`, so a build that knows only version 2
 * still opens it.
 */
export const CANVAS_TABLE_FORMAT_VERSION = 3;

/** ADR-0064 point 2: the relationships an edge can be labelled with. */
export const EDGE_LABELS = [
  "supports",
  "contradicts",
  "derived-from",
  "related-to",
  "requires-investigation",
] as const;

// Canvas coordinates are finite numbers; JSON cannot hold NaN or Infinity,
// but the parser's output is also built by code, so the schema says so.
const Coordinate = z.number().finite();

const Position = z.looseObject({ x: Coordinate, y: Coordinate });

const Size = z.looseObject({
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

/**
 * A pinned result: a reference to an artefact, and for a copy-mode artefact
 * to one of its versions, never a copy (ADR-0064 point 3). A link-mode
 * artefact has no versions, so its node has none either.
 */
const ArtefactNode = z.looseObject({
  id: Ulid,
  type: z.literal("artefact"),
  experiment_id: Ulid,
  artefact_id: Ulid,
  version: z.number().int().positive().optional(),
  position: Position,
  size: Size,
});

/** Canvas-only text; distinct from Results Notes and Interpretation. */
const NoteNode = z.looseObject({
  id: Ulid,
  type: z.literal("note"),
  text: z.string(),
  position: Position,
  size: Size,
});

/** A labelled area for grouping cards. */
const RegionNode = z.looseObject({
  id: Ulid,
  type: z.literal("region"),
  label: SingleLine,
  position: Position,
  size: Size,
});

/** A row or column heading of a table; `id` is how cells and lines refer to it, so renaming one changes nothing else. */
const TableLine = z.looseObject({ id: Ulid, label: SingleLine });

/** The figure in one cell of a table: a reference, as an `artefact` node is (ADR-0064 point 3). */
const TableCell = z.looseObject({
  row: Ulid,
  column: Ulid,
  experiment_id: Ulid,
  artefact_id: Ulid,
  version: z.number().int().positive().optional(),
  // The picture's width over its height once known, so the table lays out the same on reopening.
  aspect: z.number().finite().positive().optional(),
});

/** What sets the shape of a table's cells: each row's, or each column's, largest figure (ADR-0071). */
export const TABLE_FITS = ["row", "column"] as const;

/**
 * A table of figures (ADR-0071): rows and columns with headings, and at most
 * one figure per cell. `fit` says whether the cells of a row, or of a column,
 * take the shape of their largest figure.
 */
const TableNode = z.looseObject({
  id: Ulid,
  type: z.literal("table"),
  rows: z.array(TableLine),
  columns: z.array(TableLine),
  cells: z.array(TableCell),
  fit: z.enum(TABLE_FITS),
  position: Position,
  size: Size,
});

export const CanvasNode = z.discriminatedUnion("type", [
  ArtefactNode,
  NoteNode,
  RegionNode,
  TableNode,
]);

/** The four sides of a card a line can be drawn from or to. */
export const HANDLE_SIDES = ["top", "right", "bottom", "left"] as const;

/** One cell of a table, by its row's and its column's ids. */
const CellRef = z.looseObject({ row: Ulid, column: Ulid });

export const CanvasEdge = z.looseObject({
  id: Ulid,
  source: Ulid,
  target: Ulid,
  // Which side of each card the line was drawn at, so it is drawn there again;
  // left out, as in the first lines drawn, the application chooses.
  source_handle: z.enum(HANDLE_SIDES).optional(),
  target_handle: z.enum(HANDLE_SIDES).optional(),
  // The cell of a table the line starts or ends at (version 3); the node at that end must be that table.
  source_cell: CellRef.optional(),
  target_cell: CellRef.optional(),
  label: z.enum(EDGE_LABELS).optional(),
});

const Viewport = z.looseObject({
  x: Coordinate,
  y: Coordinate,
  zoom: z.number().finite().positive(),
});

type CanvasShape = {
  format_version: number;
  nodes: z.infer<typeof CanvasNode>[];
};

type TableIds = { rows: Set<string>; columns: Set<string> };

/** The rows and columns of each table by node id; reports a repeated id, a cell outside its table, two figures in a cell, and a table in a version that cannot hold one. */
function checkTables(
  file: CanvasShape,
  ctx: z.RefinementCtx,
): Map<string, TableIds> {
  const tables = new Map<string, TableIds>();
  file.nodes.forEach((node, index) => {
    if (node.type !== "table") return;
    if (file.format_version < CANVAS_TABLE_FORMAT_VERSION) {
      ctx.addIssue({
        code: "custom",
        path: ["nodes", index],
        message: `a table needs canvas format version ${CANVAS_TABLE_FORMAT_VERSION}`,
      });
    }
    const ids: TableIds = { rows: new Set(), columns: new Set() };
    for (const kind of ["row", "column"] as const) {
      const lines = kind === "row" ? node.rows : node.columns;
      const seen = kind === "row" ? ids.rows : ids.columns;
      lines.forEach((line, at) => {
        if (seen.has(line.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["nodes", index, `${kind}s`, at, "id"],
            message: `${kind} id is used more than once`,
          });
        }
        seen.add(line.id);
      });
    }
    const filled = new Set<string>();
    node.cells.forEach((cell, at) => {
      for (const kind of ["row", "column"] as const) {
        const known = kind === "row" ? ids.rows : ids.columns;
        if (!known.has(cell[kind])) {
          ctx.addIssue({
            code: "custom",
            path: ["nodes", index, "cells", at, kind],
            message: `the cell's ${kind} is not in this table`,
          });
        }
      }
      const key = `${cell.row}/${cell.column}`;
      if (filled.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", index, "cells", at],
          message: "a cell holds more than one figure",
        });
      }
      filled.add(key);
    });
    tables.set(node.id, ids);
  });
  return tables;
}

/** A line's `source_cell` or `target_cell`: only in a version that has tables, only at a table, and only at a cell it has. */
function checkCellEnd(
  version: number,
  edge: z.infer<typeof CanvasEdge>,
  end: "source" | "target",
  index: number,
  tables: Map<string, TableIds>,
  ctx: z.RefinementCtx,
): void {
  const cell = end === "source" ? edge.source_cell : edge.target_cell;
  if (cell === undefined) return;
  const path = ["edges", index, `${end}_cell`];
  if (version < CANVAS_TABLE_FORMAT_VERSION) {
    ctx.addIssue({
      code: "custom",
      path,
      message: `a line to a table cell needs canvas format version ${CANVAS_TABLE_FORMAT_VERSION}`,
    });
  }
  const table = tables.get(edge[end]);
  if (table === undefined) {
    ctx.addIssue({
      code: "custom",
      path,
      message: `${end} is not a table, so it has no cells`,
    });
  } else if (!table.rows.has(cell.row) || !table.columns.has(cell.column)) {
    ctx.addIssue({
      code: "custom",
      path,
      message: "the cell is not in this table",
    });
  }
}

/**
 * ADR-0064: `canvases/<ULID>.canvas.json`. Checks everything inside the file:
 * node and edge ids are unique and every edge joins two nodes of this canvas.
 * Whether the experiments and artefact versions named by nodes exist is a
 * cross-file question for the project loader; a dangling reference is shown
 * as missing and never rewritten.
 */
export const CanvasFile = z
  .looseObject({
    format_version: z.union([
      z.literal(CANVAS_FORMAT_VERSION),
      z.literal(CANVAS_TABLE_FORMAT_VERSION),
    ]),
    id: Ulid,
    name: SingleLine,
    nodes: z.array(CanvasNode),
    edges: z.array(CanvasEdge),
    viewport: Viewport,
  })
  .superRefine((file, ctx) => {
    const nodeIds = new Set<string>();
    file.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", index, "id"],
          message: "node id is used more than once",
        });
      }
      nodeIds.add(node.id);
    });

    const tables = checkTables(file, ctx);

    const edgeIds = new Set<string>();
    file.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["edges", index, "id"],
          message: "edge id is used more than once",
        });
      }
      edgeIds.add(edge.id);
      for (const end of ["source", "target"] as const) {
        if (!nodeIds.has(edge[end])) {
          ctx.addIssue({
            code: "custom",
            path: ["edges", index, end],
            message: `${end} is not a node on this canvas`,
          });
        }
        checkCellEnd(file.format_version, edge, end, index, tables, ctx);
      }
    });
  });

export type CanvasFileModel = z.infer<typeof CanvasFile>;
export type CanvasNodeModel = z.infer<typeof CanvasNode>;
export type CanvasEdgeModel = z.infer<typeof CanvasEdge>;
