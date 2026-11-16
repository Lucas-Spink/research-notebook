import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  ConnectionMode,
  type Connection,
  type Edge,
  type EdgeChange,
  useReactFlow,
  useViewport,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import type { CanvasFileModel } from "@research-notebook/format";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTheme } from "../../shared/theme";
import { ArtefactCard } from "./ArtefactCard";
import { CardProvider } from "./CardContext";
import { TableCard } from "./TableCard";
import { canvasMessages as m } from "./messages";
import { edgeEditsFrom, editsFrom, type CanvasEdit } from "./model/flowChanges";
import {
  toFlowEdges,
  toFlowNodes,
  type CanvasFlowNode,
} from "./model/flowNodes";
import { connectNodes, type Side } from "./model/notes";
import type { Extent, Point } from "./model/nodes";
import type { CardServices } from "./model/results";
import type { TableChange } from "./model/tables";
import { NoteCard, RegionCard } from "./OtherCards";
import type { SurfaceBridge } from "./useCanvases";
import "@xyflow/react/dist/style.css";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
/** Grid spacing in canvas units: a faint fine grid, and a stronger one every fifth line of it. */
/** How far an arrow key nudges a card, and with Shift. Cards snap to twice the small step. */
const NUDGE = 10;
const NUDGE_BIG = 40;
const ARROWS: Record<string, { x: number; y: number } | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const FINE_GRID = 40;
const COARSE_GRID = FINE_GRID * 5;
const NODE_TYPES = {
  artefact: ArtefactCard,
  note: NoteCard,
  region: RegionCard,
  table: TableCard,
};
const DELETE_KEYS = ["Backspace", "Delete"];

/** The side of a card a handle is on: its id, if it is one of the four. */
function sideOf(handle: string | null | undefined): Side | undefined {
  return handle === "top" ||
    handle === "right" ||
    handle === "bottom" ||
    handle === "left"
    ? handle
    : undefined;
}

/** Zoom as the whole percentage shown to the person. */
function percent(zoom: number): number {
  return Math.round(zoom * 100);
}

type Props = {
  canvas: CanvasFileModel;
  services: CardServices;
  /** The canvas can be changed. When it cannot, it can still be panned, zoomed and looked at. */
  editable: boolean;
  onEdits: (edits: CanvasEdit[]) => void;
  onViewport: (view: Viewport) => void;
  onUpdateVersion: (id: string, version: number) => void;
  /** Makes an id for a new line. */
  newId: () => string;
  registerSurface: (bridge: SurfaceBridge | null) => void;
  /** Adds a note centred on a point of the canvas; left out where the canvas cannot be changed. */
  onAddNote?: ((at: Point) => void) | undefined;
};

/** The strip under the canvas: zoom, Fit to view and Reset. Inside the flow's provider. */
function ViewportBar({
  home,
  onFitAll,
}: {
  home: CanvasFileModel["viewport"];
  /** Asks every figure to fit its picture; left out where the canvas cannot be changed. */
  onFitAll?: (() => void) | undefined;
}) {
  const { zoom } = useViewport();
  const flow = useReactFlow();
  return (
    <div className="canvas-viewbar">
      <span aria-live="polite">{m.zoom(percent(zoom))}</span>
      <button type="button" onClick={() => void flow.fitView({ duration: 0 })}>
        {m.fitView}
      </button>
      <button type="button" onClick={() => void flow.setViewport(home)}>
        {m.resetView}
      </button>
      {onFitAll !== undefined && (
        <button type="button" onClick={onFitAll}>
          {m.fitAllFigures}
        </button>
      )}
      <span className="canvas-viewbar__credit">{m.credit}</span>
    </div>
  );
}

/** Tells the rest of the window where the canvas is on screen, so a drop can be turned into a place on it. */
function useBridge(
  container: RefObject<HTMLDivElement | null>,
  register: Props["registerSurface"],
  focusNode: (id: string) => void,
  focusNew: (id: string) => void,
) {
  const flow = useReactFlow();
  useEffect(() => {
    register({
      toCanvas: (screen) => flow.screenToFlowPosition(screen),
      centre: () => {
        const box = container.current?.getBoundingClientRect();
        return flow.screenToFlowPosition({
          x: (box?.left ?? 0) + (box?.width ?? 0) / 2,
          y: (box?.top ?? 0) + (box?.height ?? 0) / 2,
        });
      },
      focusNode,
      focusNew,
      cellAt: (screen) => {
        // Not every environment can say what is under a point (jsdom cannot).
        if (typeof document.elementFromPoint !== "function") return null;
        const cell = document
          .elementFromPoint(screen.x, screen.y)
          ?.closest<HTMLElement>("[data-table-cell]");
        const { table, row, column } = cell?.dataset ?? {};
        return cell != null &&
          table !== undefined &&
          row !== undefined &&
          column !== undefined
          ? { table, row, column }
          : null;
      },
    });
    return () => register(null);
  }, [flow, container, register, focusNode, focusNew]);
}

function Flow({
  canvas,
  services,
  editable,
  onEdits,
  onViewport,
  onUpdateVersion,
  newId,
  registerSurface,
  onAddNote,
}: Props) {
  const { theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const flow = useReactFlow();

  const [nodes, setNodes] = useState<CanvasFlowNode[]>(() =>
    toFlowNodes(canvas, services.resolve, new Set()),
  );
  // The file changed (a pin, a save, a result renamed elsewhere): draw it again, keeping what is selected.
  useEffect(() => {
    setNodes((now) =>
      toFlowNodes(
        canvas,
        services.resolve,
        new Set(now.filter((n) => n.selected).map((n) => n.id)),
      ),
    );
  }, [canvas.nodes, services]);

  const [edges, setEdges] = useState<Edge[]>(() => toFlowEdges(canvas));
  // Counts the requests to fit every figure to its picture; each card answers a new count.
  const [fitSignal, setFitSignal] = useState(0);
  useEffect(() => {
    setEdges((now) => {
      const selected = new Set(now.filter((e) => e.selected).map((e) => e.id));
      return toFlowEdges(canvas).map((edge) => ({
        ...edge,
        selected: selected.has(edge.id),
      }));
    });
  }, [canvas.edges]);

  // Selects one card and brings it into view, from the notes summary.
  const focusNode = useCallback(
    (id: string) => {
      setNodes((now) => now.map((n) => ({ ...n, selected: n.id === id })));
      void flow.fitView({ nodes: [{ id }], duration: 250, maxZoom: 1.2 });
    },
    [flow],
  );
  // A note just added: selected and given the cursor once it is on the surface.
  const [wanted, setWanted] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (wanted === null || !canvas.nodes.some((n) => n.id === wanted)) return;
    setNodes((now) => now.map((n) => ({ ...n, selected: n.id === wanted })));
    setFocusId(wanted);
    setWanted(null);
  }, [wanted, canvas.nodes]);
  const onFocused = useCallback(() => setFocusId(null), []);
  useBridge(container, registerSurface, focusNode, setWanted);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasFlowNode>[]) => {
      const next = applyNodeChanges(changes, nodesRef.current);
      nodesRef.current = next;
      setNodes(next);
      if (!editable) return;
      const edits = editsFrom(changes, next);
      if (edits.length > 0) onEdits(edits);
    },
    [editable, onEdits],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((now) => applyEdgeChanges(changes, now));
      if (!editable) return;
      const edits = edgeEditsFrom(changes);
      if (edits.length > 0) onEdits(edits);
    },
    [editable, onEdits],
  );
  const onConnect = useCallback(
    (connection: Connection) =>
      onEdits([
        {
          kind: "connect",
          id: newId(),
          from: connection.source,
          to: connection.target,
          fromHandle: sideOf(connection.sourceHandle),
          toHandle: sideOf(connection.targetHandle),
        },
      ]),
    [onEdits, newId],
  );
  // A line is only drawn where the model would keep it: not figure to figure, not to itself, not twice.
  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      connectNodes(canvas, connection.source, connection.target, () => "x") !==
      canvas,
    [canvas],
  );
  const remove = useCallback(
    (id: string) => onEdits([{ kind: "remove", ids: [id] }]),
    [onEdits],
  );
  const context = useMemo(
    () => ({
      services,
      editable,
      onRemove: remove,
      onUpdateVersion,
      onTable: (id: string, change: TableChange) =>
        onEdits([{ kind: "table", id, change }]),
      newId,
      onFit: (id: string, to: Extent) => onEdits([{ kind: "resize", id, to }]),
      fitSignal,
      focusId,
      onFocused,
      onNoteText: (id: string, text: string) =>
        onEdits([{ kind: "noteText", id, text }]),
    }),
    [
      services,
      editable,
      remove,
      onUpdateVersion,
      onEdits,
      newId,
      fitSignal,
      focusId,
      onFocused,
    ],
  );

  return (
    <div
      ref={container}
      className="canvas-surface"
      aria-label={m.surfaceLabel}
      role="region"
      data-drop-zone="canvas"
      onDoubleClick={(event) => {
        // A double-click on the empty canvas adds a note there.
        const target = event.target;
        if (
          onAddNote !== undefined &&
          target instanceof Element &&
          target.classList.contains("react-flow__pane")
        ) {
          onAddNote(
            flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          );
        }
      }}
      onKeyDown={(event) => {
        // The arrow keys nudge what is selected, unless they are for a text box.
        const step = ARROWS[event.key];
        const target = event.target;
        if (
          !editable ||
          step === undefined ||
          (target instanceof HTMLElement &&
            (target.isContentEditable ||
              ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
        ) {
          return;
        }
        const size = event.shiftKey ? NUDGE_BIG : NUDGE;
        const moving = nodesRef.current.filter((n) => n.selected);
        if (moving.length === 0) return;
        event.preventDefault();
        onEdits(
          moving.map((n) => ({
            kind: "move" as const,
            id: n.id,
            to: {
              x: n.position.x + step.x * size,
              y: n.position.y + step.y * size,
            },
          })),
        );
      }}
    >
      <CardProvider value={context}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          connectionMode={ConnectionMode.Loose}
          // A line lands on the nearest point within reach, and the ends of
          // existing lines are not dragged loose by a click meant for a point.
          connectionRadius={36}
          edgesReconnectable={false}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onMoveEnd={(_event, view) => onViewport(view)}
          defaultViewport={canvas.viewport}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          colorMode={theme}
          // The library's credit is shown in the strip below instead, as text
          // that cannot navigate the window away from the application.
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
          snapToGrid
          snapGrid={[NUDGE * 2, NUDGE * 2]}
          nodesDraggable={editable}
          nodesConnectable={editable}
          deleteKeyCode={editable ? DELETE_KEYS : null}
          onlyRenderVisibleElements
        >
          <Background
            id="fine"
            className="canvas-grid canvas-grid--fine"
            variant={BackgroundVariant.Lines}
            gap={FINE_GRID}
            lineWidth={1}
          />
          <Background
            id="coarse"
            className="canvas-grid canvas-grid--coarse"
            variant={BackgroundVariant.Lines}
            gap={COARSE_GRID}
            lineWidth={1.25}
          />
          <Controls showInteractive={false} />
          <MiniMap
            className="canvas-minimap"
            aria-label={m.minimap}
            pannable
            zoomable
          />
        </ReactFlow>
        {nodes.length === 0 && (
          <p className="canvas-surface__hint">{m.pinHint}</p>
        )}
      </CardProvider>
      <ViewportBar
        home={canvas.viewport}
        onFitAll={editable ? () => setFitSignal((n) => n + 1) : undefined}
      />
    </div>
  );
}

/**
 * The canvas itself (ADR-0064): the cards of one canvas file on a surface that
 * pans and zooms. What is dropped on it, and where, is decided by the rest of
 * the window; this draws the cards, reports where a gesture ended, and says
 * where the canvas is on screen. The view the file was saved with is where it
 * starts, and where the person leaves it is saved after a pause.
 */
export function CanvasSurface(props: Props) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
