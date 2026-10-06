import {
  bundled,
  describeBundle,
  gitBundleMessages,
  repositoryLabel,
} from "./messages";
import type { GitBundleModel } from "./useGitBundle";

/**
 * Writes git bundles of the repositories provenance references (FR-ARC-04).
 * It is opt-in, renders what `useGitBundle` holds and writes only through it.
 * A failed run is shown as a failure and lists no bundles.
 */
export function GitBundlePanel({ model }: { model: GitBundleModel }) {
  const { state, repositories, results, failure, writable } = model;
  const nothing = repositories.length === 0;
  const label =
    state === "running"
      ? gitBundleMessages.writing
      : state === "idle"
        ? gitBundleMessages.write
        : gitBundleMessages.again;
  const done = results.filter((r) => r.outcome.kind === "written").length;
  return (
    <section className="git-bundle" aria-labelledby="git-bundle-heading">
      <h4 id="git-bundle-heading">{gitBundleMessages.heading}</h4>
      <p>{gitBundleMessages.intro}</p>
      {nothing && <p>{gitBundleMessages.nothingToBundle}</p>}
      {!writable && <p>{gitBundleMessages.readOnly}</p>}
      {!nothing && state !== "done" && (
        <>
          <h5>{gitBundleMessages.repositoriesHeading}</h5>
          <ul>
            {repositories.map((repo) => (
              <li key={repo}>{repositoryLabel(repo)}</li>
            ))}
          </ul>
        </>
      )}
      <button
        type="button"
        disabled={state === "running" || !writable || nothing}
        onClick={model.run}
      >
        {label}
      </button>
      <div role="status" aria-live="polite">
        {state === "idle" && !nothing && gitBundleMessages.notWritten}
        {state === "done" && bundled(done, results.length)}
      </div>
      {state === "failed" && failure !== null && (
        <p role="alert">{gitBundleMessages.failures[failure]}</p>
      )}
      {state === "done" && results.length > 0 && (
        <>
          <h5>{gitBundleMessages.resultsHeading}</h5>
          <ul>
            {results.map(({ repo, outcome }) => (
              <li key={repo}>{describeBundle(repo, outcome)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
