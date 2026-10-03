import { useEffect, useRef, useState } from "react";
import { commands } from "../../ipc/bindings";
import { assertNever } from "../../shared/assertNever";
import { sourceStatusText, sourceDetailsMessages as text } from "./messages";
import { sourceDetails } from "./model/sourceDetails";
import { useSources } from "./SourcesContext";
import {
  usePdfAttachment,
  type PdfState,
  type SourceDetailsApi,
} from "./useSourceDetails";

export type { SourceDetailsApi } from "./useSourceDetails";

/** Why Open PDF is not offered, or `null` when it is. */
function pdfNote(pdf: PdfState): string | null {
  switch (pdf.kind) {
    case "checking":
      return text.checkingPdf;
    case "found":
      return null;
    case "none":
      return text.noPdf;
    case "notRunning":
      return text.pdfOfflineNotRunning;
    case "disabled":
      return text.pdfOfflineDisabled;
    case "failed":
      return text.pdfFailed;
    default:
      return assertNever(pdf);
  }
}

/**
 * The open source's metadata with Open in Zotero, a DOI link and Open PDF
 * (FR-CIT-04). Everything but Open PDF comes from `bibliography.json`, so
 * the panel works with Zotero closed (FR-CIT-06). Rust builds and launches
 * every link; the webview only names the target.
 */
export function SourceDetailsPanel({
  api = commands,
}: {
  api?: SourceDetailsApi;
}) {
  const { items, selected, select } = useSources();
  const item = items.find((candidate) => candidate.id === selected);
  const details = item === undefined ? null : sourceDetails(item);
  const pdf = usePdfAttachment(details, api);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = details?.citekey ?? null;

  useEffect(() => {
    setFailed(false);
    heading.current?.focus();
  }, [shown]);

  if (details === null) return null;

  const open = (link: Parameters<SourceDetailsApi["openSourceLink"]>[0]) => {
    setFailed(false);
    void api
      .openSourceLink(link)
      .then((result) => setFailed(result.status === "error"))
      .catch(() => setFailed(true));
  };
  const doi = details.doi;

  return (
    <section
      aria-labelledby="source-details-heading"
      className="citations__details"
    >
      <h4 id="source-details-heading" ref={heading} tabIndex={-1}>
        {text.heading}
      </h4>
      <dl>
        <dt>{text.titleLabel}</dt>
        <dd>{details.title}</dd>
        {details.authors.length > 0 && (
          <>
            <dt>{text.authorsLabel}</dt>
            <dd>{details.authors.join("; ")}</dd>
          </>
        )}
        {details.year !== null && (
          <>
            <dt>{text.yearLabel}</dt>
            <dd>{details.year}</dd>
          </>
        )}
        {details.container !== null && (
          <>
            <dt>{text.containerLabel}</dt>
            <dd>{details.container}</dd>
          </>
        )}
        {doi !== null && (
          <>
            <dt>{text.doiLabel}</dt>
            <dd>{doi}</dd>
          </>
        )}
        <dt>{text.statusLabel}</dt>
        <dd>{sourceStatusText(details.status)}</dd>
      </dl>
      <div className="citations__details-actions">
        <button
          type="button"
          disabled={details.status === "missing"}
          onClick={() =>
            open({
              kind: "zoteroItem",
              library: details.library,
              key: details.key,
            })
          }
        >
          {text.openInZotero}
        </button>
        {doi !== null && (
          <button type="button" onClick={() => open({ kind: "doi", doi })}>
            {text.openDoi}
          </button>
        )}
        {pdf.kind === "found" && (
          <button
            type="button"
            onClick={() =>
              open({
                kind: "zoteroPdf",
                library: details.library,
                attachmentKey: pdf.attachmentKey,
              })
            }
          >
            {text.openPdf}
          </button>
        )}
        <button type="button" onClick={() => select(null)}>
          {text.close}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {failed ? text.openFailed : pdfNote(pdf)}
      </div>
    </section>
  );
}
