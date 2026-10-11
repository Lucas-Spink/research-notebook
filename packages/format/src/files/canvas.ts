import { CANVAS_SHAPE, orderByShape } from "../key-order";
import type { FormatError, Result } from "../result";
import {
  CANVAS_FORMAT_VERSION,
  CanvasFile,
  type CanvasFileModel,
} from "../schema";
import { parseJsonFile } from "./read";

/**
 * Parses a canvas file (ADR-0064). Unknown keys are accepted and kept. A file
 * that fails is returned as an error and must be left untouched by the caller.
 */
export function parseCanvas(
  text: string,
): Result<CanvasFileModel, FormatError> {
  return parseJsonFile(text, CanvasFile, CANVAS_FORMAT_VERSION);
}

/** Writes a canvas file in canonical form (format-v2.md 3.5). */
export function serialiseCanvas(canvas: CanvasFileModel): string {
  return `${JSON.stringify(orderByShape(canvas, CANVAS_SHAPE), null, 2)}\n`;
}
