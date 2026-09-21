import { useState } from "react";
import { messages } from "./messages";

type Props = {
  /** Names what is deleted, for the button's accessible name. */
  subject: string;
  /** What will happen, shown before it is confirmed. */
  warning: string;
  disabled: boolean;
  onConfirm: () => void;
};

/**
 * Deleting moves to the trash and can be undone by hand, but is still asked
 * twice: the first press only shows what will happen.
 */
export function ConfirmDelete({
  subject,
  warning,
  disabled,
  onConfirm,
}: Props) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={`${messages.delete} ${subject}`}
        onClick={() => setAsking(true)}
      >
        {messages.delete}
      </button>
    );
  }
  return (
    <span role="group" aria-label={`${messages.delete} ${subject}`}>
      <span>{warning}</span>{" "}
      <button
        type="button"
        disabled={disabled}
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
