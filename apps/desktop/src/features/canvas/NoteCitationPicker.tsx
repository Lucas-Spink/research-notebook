import { createPortal } from "react-dom";
import { CitationPicker, useSourceSync } from "../citations";

type Props = {
  onInsert: (markdown: string) => void;
  onCancel: () => void;
};

/**
 * The citation picker over a note (FR-CIT-03), the one the section editors
 * use. It is drawn into the page body so it is not clipped by the canvas or
 * moved with it, and the sources chosen are cached in `bibliography.json` as
 * for a section (FR-CIT-05).
 */
export function NoteCitationPicker({ onInsert, onCancel }: Props) {
  // Portalled, but still inside the provider's React tree.
  const syncInserted = useSourceSync();
  return createPortal(
    <div className="canvas-cite-overlay">
      <CitationPicker
        onInsert={onInsert}
        onInsertCitekeys={syncInserted}
        onCancel={onCancel}
      />
    </div>,
    document.body,
  );
}
