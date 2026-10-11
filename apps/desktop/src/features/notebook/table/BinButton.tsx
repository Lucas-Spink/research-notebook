import { useState } from "react";
import { messages } from "../messages";

type Props = {
  /** Names what is moved, for the button's accessible name, such as `EXP-001`. */
  subject: string;
  /** What will happen, shown before it is confirmed. */
  warning: string;
  /** Whether its buttons are tab stops; a grid cell turns them off until focus is inside it. */
  tabStop?: boolean;
  onConfirm: () => void;
};

/**
 * A visible "Move to bin" control on a question or experiment row. Nothing is
 * deleted: the item is moved to the bin and can be restored from it. The
 * first press only shows what will happen, so a stray click does nothing.
 */
export function BinButton({
  subject,
  warning,
  tabStop = true,
  onConfirm,
}: Props) {
  const [asking, setAsking] = useState(false);
  const tabIndex = tabStop ? undefined : -1;
  if (!asking) {
    return (
      <button
        type="button"
        className="wtable__bin"
        tabIndex={tabIndex}
        aria-label={messages.moveToBinLabel(subject)}
        title={messages.moveToBin}
        onClick={() => setAsking(true)}
      >
        <span aria-hidden="true">🗑</span>
        <span className="wtable__bin-text">{messages.moveToBin}</span>
      </button>
    );
  }
  return (
    <span
      role="group"
      className="wtable__bin-ask"
      aria-label={messages.moveToBinLabel(subject)}
    >
      <span>{warning}</span>{" "}
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {messages.confirmDelete}
      </button>{" "}
      <button type="button" onClick={() => setAsking(false)}>
        {messages.cancel}
      </button>
    </span>
  );
}
