import { z } from "zod";
import { SingleLine, Ulid } from "./common";

/**
 * The format version that introduced canvas files (ADR-0064). A canvas file
 * carries its own version so a reader can tell it apart from a version 1
 * project, which never held one.
 */
export const CANVAS_FORMAT_VERSION = 2;

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

export const CanvasNode = z.discriminatedUnion("type", [
  ArtefactNode,
  NoteNode,
  RegionNode,
]);

/** The four sides of a card a line can be drawn from or to. */
export const HANDLE_SIDES = ["top", "right", "bottom", "left"] as const;

export const CanvasEdge = z.looseObject({
  id: Ulid,
  source: Ulid,
  target: Ulid,
  // Which side of each card the line was drawn at, so it is drawn there again;
  // left out, as in the first lines drawn, the application chooses.
  source_handle: z.enum(HANDLE_SIDES).optional(),
  target_handle: z.enum(HANDLE_SIDES).optional(),
  label: z.enum(EDGE_LABELS).optional(),
});

const Viewport = z.looseObject({
  x: Coordinate,
  y: Coordinate,
  zoom: z.number().finite().positive(),
});

/**
 * ADR-0064: `canvases/<ULID>.canvas.json`. Checks everything inside the file:
 * node and edge ids are unique and every edge joins two nodes of this canvas.
 * Whether the experiments and artefact versions named by nodes exist is a
 * cross-file question for the project loader; a dangling reference is shown
 * as missing and never rewritten.
 */
export const CanvasFile = z
  .looseObject({
    format_version: z.literal(CANVAS_FORMAT_VERSION),
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
      }
    });
  });

export type CanvasFileModel = z.infer<typeof CanvasFile>;
export type CanvasNodeModel = z.infer<typeof CanvasNode>;
export type CanvasEdgeModel = z.infer<typeof CanvasEdge>;
