import { useEffect, useRef, useState } from "react";
import samplePngUrl from "../../assets/preview-spike/sample.png?url";
import samplePdfUrl from "../../assets/preview-spike/sample.pdf?url";
import sampleSvgUrl from "../../assets/preview-spike/sample.svg?url";
import { renderThumbnail } from "./model/thumbnail";
import { renderFirstPage } from "./model/pdfFirstPage";
import "./PreviewSpike.css";

/**
 * S1-T05 spike evidence: a PNG thumbnail generated in Rust, a PDF's first
 * page via pdf.js, and an SVG via a plain `<img>`, all visible together in
 * the Tauri window (spec section 8, gate S1-G05).
 */
function PreviewSpike() {
  const pngCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const [pngError, setPngError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = pngCanvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    void fetch(samplePngUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => renderThumbnail(new Uint8Array(buffer), canvas))
      .then((result) => {
        if (!cancelled && !result.ok) setPngError(result.error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return;
    return renderFirstPage(samplePdfUrl, canvas);
  }, []);

  return (
    <section className="preview-spike">
      <figure>
        <canvas ref={pngCanvasRef} />
        <figcaption>PNG thumbnail (Rust, nb-preview)</figcaption>
        {pngError && <p role="alert">{pngError}</p>}
      </figure>

      <figure>
        <canvas ref={pdfCanvasRef} />
        <figcaption>PDF first page (pdf.js)</figcaption>
      </figure>

      <figure>
        <img src={sampleSvgUrl} alt="SVG sample" />
        <figcaption>SVG (&lt;img&gt;)</figcaption>
      </figure>
    </section>
  );
}

export default PreviewSpike;
