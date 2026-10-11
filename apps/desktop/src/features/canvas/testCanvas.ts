import {
  serialiseCanvas,
  type CanvasFileModel,
} from "@research-notebook/format";
import { newCanvasFile } from "./model/canvasFiles";

/** A canvas file's text, built from an empty canvas by `build`, for tests that start from a canvas already holding something. */
export function serialiseCanvasText(
  id: string,
  name: string,
  build: (empty: CanvasFileModel) => CanvasFileModel,
): string {
  return serialiseCanvas(build(newCanvasFile(id, name)));
}
