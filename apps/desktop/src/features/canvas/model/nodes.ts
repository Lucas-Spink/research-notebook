import type {
  CanvasFileModel,
  CanvasNodeModel,
} from "@research-notebook/format";

/** A result card as stored in a canvas file (format-v1.md 4.9). */
export type ArtefactNode = Extract<CanvasNodeModel, { type: "artefact" }>;

export type Point = { x: number; y: number };
export type Extent = { width: number; height: number };

/** A result to pin: which experiment, which artefact, and for a copy-mode one which version. */
export type PinRef = {
  experimentId: string;
  artefactId: string;
  version?: number;
};

/** The size a new card has, and the least a card may be resized to. */
export const DEFAULT_CARD: Extent = { width: 360, height: 280 };
export const MIN_CARD: Extent = { width: 160, height: 120 };

/** How far each further card of one drop is shifted, so a stack stays readable. */
const CASCADE = 28;

const isArtefact = (node: CanvasNodeModel): node is ArtefactNode =>
  node.type === "artefact";

/** The result cards of a canvas, in file order. */
export function artefactNodes(file: CanvasFileModel): ArtefactNode[] {
  return file.nodes.filter(isArtefact);
}

/** The artefacts that have at least one card, to mark them as pinned in the results list. */
export function pinnedIds(file: CanvasFileModel): ReadonlySet<string> {
  return new Set(artefactNodes(file).map((node) => node.artefact_id));
}

/**
 * Adds a card for each result, the first centred on `at` (canvas coordinates)
 * and the rest cascaded from it. A result may be pinned any number of times.
 * The input is not changed; everything else in the file is kept as it was.
 * `newId` is injected so tests are deterministic.
 */
export function pinResults(
  file: CanvasFileModel,
  refs: readonly PinRef[],
  at: Point,
  newId: () => string,
): CanvasFileModel {
  if (refs.length === 0) return file;
  const added: ArtefactNode[] = refs.map((ref, index) => ({
    id: newId(),
    type: "artefact",
    experiment_id: ref.experimentId,
    artefact_id: ref.artefactId,
    ...(ref.version === undefined ? {} : { version: ref.version }),
    position: {
      x: Math.round(at.x - DEFAULT_CARD.width / 2 + index * CASCADE),
      y: Math.round(at.y - DEFAULT_CARD.height / 2 + index * CASCADE),
    },
    size: { ...DEFAULT_CARD },
  }));
  return { ...file, nodes: [...file.nodes, ...added] };
}

function changeNode(
  file: CanvasFileModel,
  id: string,
  change: (node: CanvasNodeModel) => CanvasNodeModel | null,
): CanvasFileModel {
  let changed = false;
  const nodes = file.nodes.map((node) => {
    if (node.id !== id) return node;
    const next = change(node);
    if (next === null) return node;
    changed = true;
    return next;
  });
  return changed ? { ...file, nodes } : file;
}

/** Puts a card at `to`, in whole pixels. The file is returned as it was if nothing moved. */
export function moveNode(
  file: CanvasFileModel,
  id: string,
  to: Point,
): CanvasFileModel {
  const position = { x: Math.round(to.x), y: Math.round(to.y) };
  return changeNode(file, id, (node) =>
    node.position.x === position.x && node.position.y === position.y
      ? null
      : { ...node, position: { ...node.position, ...position } },
  );
}

/** Gives a card a size, whole pixels and never below the minimum. */
export function resizeNode(
  file: CanvasFileModel,
  id: string,
  to: Extent,
): CanvasFileModel {
  const size = {
    width: Math.max(MIN_CARD.width, Math.round(to.width)),
    height: Math.max(MIN_CARD.height, Math.round(to.height)),
  };
  return changeNode(file, id, (node) =>
    node.size.width === size.width && node.size.height === size.height
      ? null
      : { ...node, size: { ...node.size, ...size } },
  );
}

/**
 * Removes cards, and the connectors that joined them. Only the canvas changes:
 * the results stay where they are (ADR-0064).
 */
export function removeNodes(
  file: CanvasFileModel,
  ids: readonly string[],
): CanvasFileModel {
  const gone = new Set(ids);
  if (!file.nodes.some((node) => gone.has(node.id))) return file;
  return {
    ...file,
    nodes: file.nodes.filter((node) => !gone.has(node.id)),
    edges: file.edges.filter(
      (edge) => !gone.has(edge.source) && !gone.has(edge.target),
    ),
  };
}

/**
 * Moves one result card to another version, on the person's say-so only: a
 * card never advances by itself, so a figure used for an interpretation stays
 * traceable to the evidence that was looked at (ADR-0064).
 */
export function updatePinnedVersion(
  file: CanvasFileModel,
  id: string,
  version: number,
): CanvasFileModel {
  return changeNode(file, id, (node) =>
    isArtefact(node) && node.version !== version ? { ...node, version } : null,
  );
}

/** A viewport rounded so that small drifts do not each become a saved change. */
export function roundedViewport(view: { x: number; y: number; zoom: number }): {
  x: number;
  y: number;
  zoom: number;
} {
  return {
    x: Math.round(view.x),
    y: Math.round(view.y),
    zoom: Math.round(view.zoom * 1000) / 1000,
  };
}

/** Records where the canvas was left. The file is returned as it was if the view is the same. */
export function setViewport(
  file: CanvasFileModel,
  view: { x: number; y: number; zoom: number },
): CanvasFileModel {
  const next = roundedViewport(view);
  const now = file.viewport;
  return now.x === next.x && now.y === next.y && now.zoom === next.zoom
    ? file
    : { ...file, viewport: { ...now, ...next } };
}
