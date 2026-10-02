import { createPortal } from "react-dom";
import { CitationPicker, useSourceSync } from "../../citations";
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
  // The overlay is portalled but still inside the provider's React tree.
  const syncInserted = useSourceSync();
  return createPortal(
    <div className="expanded__citation-picker-overlay">
      <CitationPicker
        onInsert={onInsert}
        onInsertCitekeys={syncInserted}
        onCancel={onCancel}
      />
    </div>,
    document.body,
  );
}
