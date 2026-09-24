import type { ReactNode } from "react";
import { previewMessages as m } from "./messages";
import { usePdfPages, usePdfThumbnail } from "./usePdf";

type PdfProps = { name: string; url: string; onRenderFailed: () => void };

/** A PDF page viewer; each page is drawn when it is shown (spec 8). */
export function PdfView({ name, url, onRenderFailed }: PdfProps) {
  const { canvasRef, page, pages, previous, next } = usePdfPages(
    url,
    onRenderFailed,
  );
  return (
    <div className="preview__pdf">
      <div className="preview__scroll">
        <canvas
          ref={canvasRef}
          className="preview__page"
          aria-label={m.imageAlt(name)}
        />
      </div>
      {pages !== null && pages > 1 && (
        <div className="preview__pager">
          <button type="button" onClick={previous} disabled={page <= 1}>
            {m.pdf.previous}
          </button>
          <span aria-live="polite">{m.pdf.page(page, pages)}</span>
          <button type="button" onClick={next} disabled={page >= pages}>
            {m.pdf.next}
          </button>
        </div>
      )}
    </div>
  );
}

type PdfThumbnailProps = { name: string; url: string; fallback: ReactNode };

/** A PDF's first page at 256 px, or `fallback` if it cannot be drawn. */
export function PdfThumbnail({ name, url, fallback }: PdfThumbnailProps) {
  const { canvasRef, failed } = usePdfThumbnail(url);
  if (failed) return <>{fallback}</>;
  return (
    <canvas
      ref={canvasRef}
      className="preview-thumb__image"
      aria-label={m.thumbnailAlt(name)}
    />
  );
}
