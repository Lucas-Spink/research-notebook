import { messages, zoteroStatusText } from "./messages";
import type { ZoteroState } from "./model/status";
import "./Citations.css";

type Props = {
  /** `null` while the first check has not answered yet: nothing is shown. */
  state: ZoteroState | null;
};

/**
 * Zotero's connectivity, and how to fix it when it is not connected
 * (FR-CIT-01). A coloured dot gives an at-a-glance state; the text next to
 * it, and the guidance below it, are what actually carries the information
 * for anyone who cannot see colour.
 */
export function ZoteroStatusIndicator({ state }: Props) {
  if (state === null) return null;
  const { label, guidance } = zoteroStatusText(state);
  return (
    <p role="status" className="citations__status">
      <span
        className={`citations__dot citations__dot--${state.kind}`}
        aria-hidden="true"
      />
      <strong>{messages.heading}:</strong> {label}
      {guidance !== null && (
        <span className="citations__guidance"> {guidance}</span>
      )}
    </p>
  );
}
