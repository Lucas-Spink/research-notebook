import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
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
import { canvasMessages as m } from "./messages";
import { editsFrom, type CanvasEdit } from "./model/flowChanges";
import { toFlowNodes, type CanvasFlowNode } from "./model/flowNodes";
import type { CardServices } from "./model/results";
import { NoteCard, RegionCard } from "./OtherCards";
import type { SurfaceBridge } from "./useCanvases";
import "@xyflow/react/dist/style.css";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
/** Grid spacing in canvas units: a faint fine grid, and a stronger one every fifth line of it. */
const FINE_GRID = 40;
const COARSE_GRID = FINE_GRID * 5;
const NODE_TYPES = {
  artefact: ArtefactCard,
  note: NoteCard,
  region: RegionCard,
};
const DELETE_KEYS = ["Backspace", "Delete"];

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
  registerSurface: (bridge: SurfaceBridge | null) => void;
};

/** The strip under the canvas: zoom, Fit to view and Reset. Inside the flow's provider. */
function ViewportBar({ home }: { home: CanvasFileModel["viewport"] }) {
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
      <span className="canvas-viewbar__credit">{m.credit}</span>
    </div>
  );
}

/** Tells the rest of the window where the canvas is on screen, so a drop can be turned into a place on it. */
function useBridge(
  container: RefObject<HTMLDivElement | null>,
  register: Props["registerSurface"],
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
    });
    return () => register(null);
  }, [flow, container, register]);
}

function Flow({
  canvas,
  services,
  editable,
  onEdits,
  onViewport,
  onUpdateVersion,
  registerSurface,
}: Props) {
  const { theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  useBridge(container, registerSurface);

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

  const remove = useCallback(
    (id: string) => onEdits([{ kind: "remove", ids: [id] }]),
    [onEdits],
  );
  const context = useMemo(
    () => ({ services, editable, onRemove: remove, onUpdateVersion }),
    [services, editable, remove, onUpdateVersion],
  );

  return (
    <div
      ref={container}
      className="canvas-surface"
      aria-label={m.surfaceLabel}
      role="region"
      data-drop-zone="canvas"
    >
      <CardProvider value={context}>
        <ReactFlow
          nodes={nodes}
          edges={[]}
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
          nodesDraggable={editable}
          nodesConnectable={false}
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
        </ReactFlow>
        {nodes.length === 0 && (
          <p className="canvas-surface__hint">{m.pinHint}</p>
        )}
      </CardProvider>
      <ViewportBar home={canvas.viewport} />
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
