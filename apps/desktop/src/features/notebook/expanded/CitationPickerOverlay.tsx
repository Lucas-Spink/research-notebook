import { createPortal } from "react-dom";
import { CitationPicker } from "../../citations";
import "./CitationPickerOverlay.css";

type Props = {
  onInsert: (markdown: string) => void;
  onCancel: () => void;
};

/**
 * Portals the citation picker to the document body (FR-CIT-03), for the
 * same reason `ReferencePreviewOverlay` does: inside a table row, a fixed
 * overlay would otherwise be positioned relative to the row's own
 * `transform` (ADR-0043).
 */
export function CitationPickerOverlay({ onInsert, onCancel }: Props) {
  return createPortal(
    <div className="expanded__citation-picker-overlay">
      <CitationPicker onInsert={onInsert} onCancel={onCancel} />
    </div>,
    document.body,
  );
}
