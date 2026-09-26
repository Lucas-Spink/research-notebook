import type {
  ArtefactsFileModel,
  ReferenceIndex,
} from "@research-notebook/format";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { FolderHandle } from "../../../ipc/bindings";
import { PreviewPanel, type PanelApi } from "../../preview-panel";
import { expandedMessages } from "../messages";
import "./ReferencePreviewOverlay.css";

type Props = {
  api: PanelApi;
  folder: FolderHandle;
  projectId: string;
  experimentFolder: string;
  file: ArtefactsFileModel;
  artefactId: string;
  /** The reference's pinned version; `null` for a link-mode artefact. */
  version: number | null;
  /** Every experiment and section that references an artefact, across the
   * whole project (FR-SRC-03). */
  references: ReferenceIndex;
  onClose: () => void;
};

/**
 * The dialog a reference chip's activation opens (FR-EDT-06): the existing
 * preview panel (S3-T11), targeted at the chip's pinned version rather than
 * the artefact's latest. Closes on Escape or its own button, focusing the
 * button on open, the same convention `RowPanel` uses for the Results tree's
 * own row panel.
 */
export function ReferencePreviewOverlay({
  api,
  folder,
  projectId,
  experimentFolder,
  file,
  artefactId,
  version,
  references,
  onClose,
}: Props) {
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);

  // Rendered into the document body: inside a table row, the row's
  // `transform` would make this fixed overlay relative to the row (ADR-0043).
  return createPortal(
    <section
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label={expandedMessages.referencePreviewHeading}
      className="expanded__reference-preview"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <button type="button" onClick={onClose}>
        {expandedMessages.closePreview}
      </button>
      <PreviewPanel
        api={api}
        folder={folder}
        projectId={projectId}
        experimentFolder={experimentFolder}
        file={file}
        artefactId={artefactId}
        version={version}
        references={references}
      />
    </section>,
    document.body,
  );
}
