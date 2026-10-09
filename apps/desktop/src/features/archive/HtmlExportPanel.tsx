import {
  exported,
  failedPagesNote,
  htmlExportMessages,
  notPreparedNote,
} from "./messages";
import type { HtmlExportModel } from "./useHtmlExport";

/**
 * Writes the static HTML export (FR-ARC-05). It is opt-in, renders what
 * `useHtmlExport` holds and writes only through it. A failed run is shown as
 * a failure and claims no pages.
 */
export function HtmlExportPanel({ model }: { model: HtmlExportModel }) {
  const { state, outcome, failure, writable, ready } = model;
  const label =
    state === "running"
      ? htmlExportMessages.writing
      : state === "idle"
        ? htmlExportMessages.write
        : htmlExportMessages.again;
  return (
    <section className="html-export" aria-labelledby="html-export-heading">
      <h4 id="html-export-heading">{htmlExportMessages.heading}</h4>
      <p>{htmlExportMessages.intro}</p>
      {!writable && <p>{htmlExportMessages.readOnly}</p>}
      {!ready && <p>{htmlExportMessages.notLoaded}</p>}
      <button
        type="button"
        disabled={state === "running" || !writable || !ready}
        onClick={model.run}
      >
        {label}
      </button>
      <div role="status" aria-live="polite">
        {state === "idle" && htmlExportMessages.notWritten}
        {state === "done" && outcome !== null && exported(outcome)}
      </div>
      {state === "failed" && failure !== null && (
        <p role="alert">{htmlExportMessages.failures[failure]}</p>
      )}
      {state === "done" && outcome !== null && outcome.notPrepared > 0 && (
        <p>{notPreparedNote(outcome.notPrepared)}</p>
      )}
      {state === "done" &&
        outcome !== null &&
        outcome.failedPages.length > 0 && (
          <p role="alert">{failedPagesNote(outcome.failedPages)}</p>
        )}
    </section>
  );
}
