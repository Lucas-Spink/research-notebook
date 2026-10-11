import {
  CANVAS_FORMAT_VERSION,
  type CanvasFileModel,
} from "@research-notebook/format";

const CANVAS_DIR = "_notebook/canvases";
const CANVAS_SUFFIX = ".canvas.json";

/**
 * The file of a question's canvas (ADR-0065): named by the question's own
 * ULID, so a question has one canvas, and a question restored from the bin
 * finds its canvas again.
 */
export function canvasFileName(questionId: string): string {
  return `${questionId}${CANVAS_SUFFIX}`;
}

/** The project-relative path of a canvas file listed by name. */
export function canvasPathOfFile(fileName: string): string {
  return `${CANVAS_DIR}/${fileName}`;
}

/** A new, empty canvas. Presentation only: it holds no experiment text and no results. */
export function newCanvasFile(id: string, name: string): CanvasFileModel {
  return {
    format_version: CANVAS_FORMAT_VERSION,
    id,
    name,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
