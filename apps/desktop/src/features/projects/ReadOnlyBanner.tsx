import { useState } from "react";
import { messages, readOnlyBanner } from "./messages";
import { lockAction, type ReadOnlyReason } from "./model/mode";

type Props = {
  reason: ReadOnlyReason;
  busy: boolean;
  onTakeOver: () => void;
  onRetry: () => void;
  /** Called once the person has confirmed updating an older project. */
  onMigrate: () => void;
};

/**
 * Says why a project is read-only and what can be done about it
 * (FR-PRJ-06). A button appears only when the action is one the person can
 * take here: taking over a stale lock, trying again, or updating an older
 * project, which asks for confirmation first (spec 5.13 rule 4).
 */
export function ReadOnlyBanner({
  reason,
  busy,
  onTakeOver,
  onRetry,
  onMigrate,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const banner = readOnlyBanner(reason);
  const action = lockAction(reason);
  return (
    <div role="status" className="projects__banner">
      <strong>{messages.readOnlyLabel}</strong>
      <p>{banner.reason}</p>
      <p>{banner.action}</p>
      {action === "takeOver" && (
        <button type="button" disabled={busy} onClick={onTakeOver}>
          {messages.takeOver}
        </button>
      )}
      {action === "migrate" && !confirming && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {messages.migrate}
        </button>
      )}
      {action === "migrate" && confirming && (
        <div role="group" aria-labelledby="migrate-confirm-heading">
          <strong id="migrate-confirm-heading">
            {messages.migrateConfirmHeading}
          </strong>
          <p>{messages.migrateConfirmBody}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              onMigrate();
            }}
          >
            {messages.migrateConfirm}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            {messages.migrateCancel}
          </button>
        </div>
      )}
      {action === "retry" && (
        <button type="button" disabled={busy} onClick={onRetry}>
          {messages.tryAgain}
        </button>
      )}
    </div>
  );
}
