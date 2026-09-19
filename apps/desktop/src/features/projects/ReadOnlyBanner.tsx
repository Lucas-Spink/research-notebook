import { messages, readOnlyBanner } from "./messages";
import { lockAction, type ReadOnlyReason } from "./model/mode";

type Props = {
  reason: ReadOnlyReason;
  busy: boolean;
  onTakeOver: () => void;
  onRetry: () => void;
};

/**
 * Says why a project is read-only and what can be done about it
 * (FR-PRJ-06). A button appears only when the action is one the person can
 * take here: taking over a stale lock, or trying again.
 */
export function ReadOnlyBanner({ reason, busy, onTakeOver, onRetry }: Props) {
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
      {action === "retry" && (
        <button type="button" disabled={busy} onClick={onRetry}>
          {messages.tryAgain}
        </button>
      )}
    </div>
  );
}
