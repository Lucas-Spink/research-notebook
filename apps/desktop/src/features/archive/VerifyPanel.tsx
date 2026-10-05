import { describeFinding, verified, verifyMessages } from "./messages";
import type { VerifyModel } from "./useVerify";

/**
 * Verifies the captured files against `exports/manifest.csv` (FR-ARC-03). It
 * renders what `useVerify` holds, and a run that could not check anything is
 * shown as a failure, never as a clean result.
 */
export function VerifyPanel({ model }: { model: VerifyModel }) {
  const { state, outcome, failure } = model;
  const label =
    state === "running"
      ? verifyMessages.verifying
      : state === "idle"
        ? verifyMessages.verify
        : verifyMessages.again;
  const clean =
    outcome !== null &&
    outcome.findings.length === 0 &&
    outcome.unlisted.length === 0;
  return (
    <section className="verify" aria-labelledby="verify-heading">
      <h4 id="verify-heading">{verifyMessages.heading}</h4>
      <p>{verifyMessages.intro}</p>
      <button type="button" disabled={state === "running"} onClick={model.run}>
        {label}
      </button>
      <div role="status" aria-live="polite">
        {state === "idle" && verifyMessages.notRun}
        {state === "done" &&
          outcome !== null &&
          `${verified(outcome.checked)} ${clean ? verifyMessages.clean : ""}`.trim()}
      </div>
      {state === "failed" && failure !== null && (
        <p role="alert">{verifyMessages.failures[failure]}</p>
      )}
      {state === "done" && outcome !== null && outcome.findings.length > 0 && (
        <>
          <h5>{verifyMessages.findingsHeading}</h5>
          <ul>
            {outcome.findings.map((finding) => (
              <li key={finding.path}>{describeFinding(finding)}</li>
            ))}
          </ul>
        </>
      )}
      {state === "done" && outcome !== null && outcome.unlisted.length > 0 && (
        <>
          <h5>{verifyMessages.unlistedHeading}</h5>
          <p>{verifyMessages.unlistedNote}</p>
          <ul>
            {outcome.unlisted.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
