import {
  describeProblem,
  integrityOpen as integrityOpenText,
  manifestMessages,
  written,
} from "./messages";
import type { ManifestModel } from "./useManifest";

type Props = {
  model: ManifestModel;
  /** Findings of the integrity check still to resolve or acknowledge; `null` if it has not been run. */
  integrityOpen: number | null;
};

/**
 * Generates `exports/manifest.csv` (FR-ARC-02) and shows what it covered.
 * It renders what `useManifest` holds and writes only through it.
 */
export function ManifestPanel({ model, integrityOpen }: Props) {
  const { state, outcome, failure, writable } = model;
  const label =
    state === "running"
      ? manifestMessages.generating
      : state === "idle"
        ? manifestMessages.generate
        : manifestMessages.again;
  const warning =
    integrityOpen === null
      ? manifestMessages.integrityNotRun
      : integrityOpenText(integrityOpen);
  return (
    <section className="manifest" aria-labelledby="manifest-heading">
      <h4 id="manifest-heading">{manifestMessages.heading}</h4>
      <p>{manifestMessages.intro}</p>
      {warning !== null && <p>{warning}</p>}
      {!writable && <p>{manifestMessages.readOnly}</p>}
      <button
        type="button"
        disabled={state === "running" || !writable}
        onClick={model.run}
      >
        {label}
      </button>
      <div role="status" aria-live="polite">
        {state === "idle" && manifestMessages.notGenerated}
        {state === "done" && outcome !== null && written(outcome.files)}
      </div>
      {state === "failed" && failure !== null && (
        <p role="alert">{manifestMessages.failures[failure]}</p>
      )}
      {state === "done" && outcome !== null && outcome.problems.length > 0 && (
        <>
          <h5>{manifestMessages.problemsHeading}</h5>
          <ul>
            {outcome.problems.map((problem) => (
              <li key={problem.path}>{describeProblem(problem)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
