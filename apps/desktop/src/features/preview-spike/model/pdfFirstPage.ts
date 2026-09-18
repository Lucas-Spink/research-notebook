import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

// pdf.js needs its worker script's URL configured once, before the first
// getDocument() call (spec section 8: "PDF | first page at 256 px via
// pdf.js" — full-page rendering here, since this preview panel shows the
// page rather than a thumbnail).
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Renders the first page of the PDF at `pdfUrl` onto `canvas`. Returns a
 * cleanup function that cancels the load if the caller unmounts first.
 */
export function renderFirstPage(
  pdfUrl: string,
  canvas: HTMLCanvasElement,
): () => void {
  let cancelled = false;
  const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });

  void loadingTask.promise
    .then((document) => document.getPage(1))
    .then(async (page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
    });

  return () => {
    cancelled = true;
    void loadingTask.destroy();
  };
}
