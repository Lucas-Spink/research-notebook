import { CANVAS_SHAPE, orderByShape } from "../key-order";
import type { FormatError, Result } from "../result";
import {
  CANVAS_FORMAT_VERSION,
  CANVAS_TABLE_FORMAT_VERSION,
  CanvasFile,
  type CanvasFileModel,
} from "../schema";
import { parseJsonFile } from "./read";

/**
 * Parses a canvas file (ADR-0064, ADR-0071). Unknown keys are accepted and
 * kept. A file that fails is returned as an error and must be left untouched
 * by the caller. Versions 2 and 3 are read; a newer one is `unsupported-version`.
 */
export function parseCanvas(
  text: string,
): Result<CanvasFileModel, FormatError> {
  return parseJsonFile(text, CanvasFile, CANVAS_TABLE_FORMAT_VERSION);
}

/** Whether the canvas holds anything only version 3 can: a table, or a line to a table cell. */
function usesTables(canvas: CanvasFileModel): boolean {
  return (
    canvas.nodes.some((node) => node.type === "table") ||
    canvas.edges.some(
      (edge) =>
        edge.source_cell !== undefined || edge.target_cell !== undefined,
    )
  );
}

/**
 * The version a canvas is written at: 3 when it holds a table (or a line to
 * one of its cells), otherwise 2, so a canvas with no table stays readable by
 * a build that knows only version 2, even when it was read as 3 (ADR-0071).
 */
export function canvasVersionFor(canvas: CanvasFileModel): 2 | 3 {
  return usesTables(canvas)
    ? CANVAS_TABLE_FORMAT_VERSION
    : CANVAS_FORMAT_VERSION;
}

/** Writes a canvas file in canonical form (format-v2.md 3.5), at the version `canvasVersionFor` gives. */
export function serialiseCanvas(canvas: CanvasFileModel): string {
  const versioned = { ...canvas, format_version: canvasVersionFor(canvas) };
  return `${JSON.stringify(orderByShape(versioned, CANVAS_SHAPE), null, 2)}\n`;
}
