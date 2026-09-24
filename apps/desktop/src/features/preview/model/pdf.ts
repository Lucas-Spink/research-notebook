/**
 * PDF rendering through pdf.js (spec 8, ADR-0014). pdf.js is imported only
 * when a PDF is first shown, which keeps it out of the start-up bundle and
 * out of tests that never draw a PDF.
 */

/** An open PDF: its page count, and a way to draw one page. */
export type PdfDocument = {
  pages: number;
  /**
   * Draws page `page` (from 1) on `canvas`, at `scale`, or scaled so its
   * longest edge is `maxEdge` pixels when that is given.
   */
  draw(
    page: number,
    canvas: HTMLCanvasElement,
    size: { scale: number } | { maxEdge: number },
  ): Promise<void>;
  close(): void;
};

type Loading = { promise: Promise<PdfDocument>; cancel(): void };

let configured = false;

async function library() {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  if (!configured) {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    configured = true;
  }
  return pdfjs;
}

/**
 * Opens the PDF at `url`. Pages are fetched as they are drawn rather than
 * all at once: automatic fetching and streaming are off, so pdf.js asks the
 * asset protocol for the byte ranges each page needs (spec 8, "pages
 * rendered on demand").
 */
export function openPdf(url: string): Loading {
  let cancelled = false;
  let destroy: (() => Promise<void>) | null = null;
  const promise = library().then(async (pdfjs) => {
    const task = pdfjs.getDocument({
      url,
      disableAutoFetch: true,
      disableStream: true,
    });
    destroy = () => task.destroy();
    if (cancelled) {
      await task.destroy();
      throw new Error("cancelled");
    }
    const pdf = await task.promise;
    return {
      pages: pdf.numPages,
      async draw(number, canvas, size) {
        const page = await pdf.getPage(number);
        const natural = page.getViewport({ scale: 1 });
        const scale =
          "scale" in size
            ? size.scale
            : size.maxEdge / Math.max(natural.width, natural.height);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvas, viewport }).promise;
      },
      // In pdf.js 6 a document is torn down through its loading task.
      close() {
        void task.destroy();
      },
    } satisfies PdfDocument;
  });
  return {
    promise,
    cancel() {
      cancelled = true;
      void destroy?.();
    },
  };
}
