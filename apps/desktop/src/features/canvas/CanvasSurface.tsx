import {
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import type { CanvasFileModel } from "@research-notebook/format";
import { useTheme } from "../../shared/theme";
import { canvasMessages as m } from "./messages";
import "@xyflow/react/dist/style.css";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const NO_NODES: never[] = [];

/** Zoom as the whole percentage shown to the person. */
function percent(zoom: number): number {
  return Math.round(zoom * 100);
}

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

/**
 * The canvas itself: an empty, pannable and zoomable surface (ADR-0064).
 * Cards arrive with the figure workspace. The view the file was saved with is
 * where it starts; panning and zooming are not saved yet, because every save
 * is also a history snapshot and a drag would make hundreds.
 */
export function CanvasSurface({ canvas }: { canvas: CanvasFileModel }) {
  const { theme } = useTheme();
  return (
    <div className="canvas-surface" aria-label={m.surfaceLabel} role="region">
      <ReactFlowProvider>
        <ReactFlow
          nodes={NO_NODES}
          edges={NO_NODES}
          defaultViewport={canvas.viewport}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          colorMode={theme}
          // The library's credit is shown in the strip below instead, as text
          // that cannot navigate the window away from the application.
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          onlyRenderVisibleElements
        >
          <Controls showInteractive={false} />
        </ReactFlow>
        <ViewportBar home={canvas.viewport} />
      </ReactFlowProvider>
    </div>
  );
}
