import { useEffect, useState } from "react";
import type { commands } from "../../ipc/bindings";
import type { SourceDetails } from "./model/sourceDetails";

/** The two commands the details panel needs; tests pass fakes. */
export type SourceDetailsApi = Pick<
  typeof commands,
  "openSourceLink" | "zoteroPdfAttachment"
>;

/** What Zotero said about a PDF for the open source (FR-CIT-04). */
export type PdfState =
  | { kind: "checking" }
  | { kind: "found"; attachmentKey: string }
  | { kind: "none" }
  | { kind: "notRunning" }
  | { kind: "disabled" }
  | { kind: "failed" };

/**
 * Asks Zotero for the source's PDF attachment whenever the shown source
 * changes. A source missing from Zotero is not asked, and an unreachable
 * Zotero only hides Open PDF: the rest of the panel is cached data.
 */
export function usePdfAttachment(
  details: SourceDetails | null,
  api: SourceDetailsApi,
): PdfState {
  const [state, setState] = useState<PdfState>({ kind: "checking" });
  const citekey = details?.citekey ?? null;
  const library = details?.library ?? null;
  const key = details?.key ?? null;
  const asked = details !== null && details.status !== "missing";

  useEffect(() => {
    if (!asked || library === null || key === null) return;
    let current = true;
    setState({ kind: "checking" });
    api
      .zoteroPdfAttachment(library, key)
      .then((result) => {
        if (!current) return;
        if (result.status === "ok") {
          setState(
            result.data === null
              ? { kind: "none" }
              : { kind: "found", attachmentKey: result.data },
          );
        } else if (
          result.error.kind === "notRunning" ||
          result.error.kind === "disabled"
        ) {
          setState({ kind: result.error.kind });
        } else {
          setState({ kind: "failed" });
        }
      })
      .catch(() => {
        if (current) setState({ kind: "failed" });
      });
    return () => {
      current = false;
    };
  }, [api, asked, citekey, library, key]);

  return asked ? state : { kind: "none" };
}
