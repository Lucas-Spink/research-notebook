import { useCallback, useEffect, useRef, useState } from "react";
import { openPdf, type PdfDocument } from "./model/pdf";

/** Page scale in the preview panel; CSS then fits the canvas to the panel. */
const PAGE_SCALE = 1.5;
/** Longest edge of a PDF thumbnail, in pixels (spec 8). */
const THUMBNAIL_EDGE = 256;

/**
 * Opens the PDF at `url` and draws the current page on `canvasRef`. Only
 * the page shown is drawn, when it is shown (spec 8). `onFailed` is called
 * if the PDF cannot be opened or a page cannot be drawn.
 */
export function usePdfPages(url: string, onFailed: () => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(1);
  const failed = useRef(onFailed);
  useEffect(() => {
    failed.current = onFailed;
  });

  useEffect(() => {
    const loading = openPdf(url);
    let open: PdfDocument | null = null;
    loading.promise.then(
      (doc) => {
        open = doc;
        setPage(1);
        setPdf(doc);
      },
      () => failed.current(),
    );
    return () => {
      loading.cancel();
      open?.close();
      setPdf(null);
    };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (pdf === null || canvas === null) return;
    pdf.draw(page, canvas, { scale: PAGE_SCALE }).catch(() => failed.current());
  }, [pdf, page]);

  const pages = pdf?.pages ?? null;
  const previous = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const next = useCallback(
    () => setPage((p) => (pages === null ? p : Math.min(pages, p + 1))),
    [pages],
  );
  return { canvasRef, page, pages, previous, next };
}

/**
 * Draws the first page of the PDF at `url` on `canvasRef`, 256 px on its
 * longest edge (spec 8). `failed` turns true if it cannot, so the caller can
 * show the type icon instead.
 */
export function usePdfThumbnail(url: string) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const loading = openPdf(url);
    let open: PdfDocument | null = null;
    loading.promise
      .then(async (doc) => {
        open = doc;
        const canvas = canvasRef.current;
        if (canvas !== null) {
          await doc.draw(1, canvas, { maxEdge: THUMBNAIL_EDGE });
        }
      })
      .catch(() => setFailed(true));
    return () => {
      loading.cancel();
      open?.close();
    };
  }, [url]);

  return { canvasRef, failed };
}
