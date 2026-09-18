import { commands } from "../../../ipc/bindings";

export type ThumbnailResult =
  { ok: true; value: Uint8Array } | { ok: false; error: string };

/** Calls the Rust thumbnail command and draws the result onto `canvas`. */
export async function renderThumbnail(
  sourceBytes: Uint8Array,
  canvas: HTMLCanvasElement,
): Promise<ThumbnailResult> {
  const result = await commands.previewThumbnailPng(Array.from(sourceBytes));
  if (result.status === "error") {
    return { ok: false, error: result.error };
  }

  const bytes = new Uint8Array(result.data);
  const bitmap = await createImageBitmap(
    new Blob([bytes], { type: "image/png" }),
  );
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (context) {
    context.drawImage(bitmap, 0, 0);
  }
  bitmap.close();

  return { ok: true, value: bytes };
}
