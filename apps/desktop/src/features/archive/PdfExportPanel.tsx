import { pdfExportMessages } from "./messages";
import type { PdfExportModel } from "./usePdfExport";

/**
 * Writes the project PDF/A-3b (FR-ARC-06). It is opt-in, renders what
 * `usePdfExport` holds and writes only through it. A failed run is shown as a
 * failure and claims no file.
 */
export function PdfExportPanel({ model }: { model: PdfExportModel }) {
  const { state, outcome, failure, writable, ready } = model;
  const label =
    state === "running"
      ? pdfExportMessages.writing
      : state === "idle"
        ? pdfExportMessages.write
        : pdfExportMessages.again;
  return (
    <section className="pdf-export" aria-labelledby="pdf-export-heading">
      <h4 id="pdf-export-heading">{pdfExportMessages.heading}</h4>
      <p>{pdfExportMessages.intro}</p>
      {!writable && <p>{pdfExportMessages.readOnly}</p>}
      {!ready && <p>{pdfExportMessages.notLoaded}</p>}
      <button
        type="button"
        disabled={state === "running" || !writable || !ready}
        onClick={model.run}
      >
        {label}
      </button>
      <div role="status" aria-live="polite">
        {state === "idle" && pdfExportMessages.notWritten}
        {state === "done" && outcome !== null && pdfExportMessages.exported}
      </div>
      {state === "failed" && failure !== null && (
        <p role="alert">{pdfExportMessages.failures[failure]}</p>
      )}
    </section>
  );
}
