import { mismatchText, sourceStatusText, sourcesMessages } from "./messages";
import { useSources } from "./SourcesContext";

/**
 * The project's cached sources with their state, the refresh action and the
 * prompt shown before data from a different Zotero is replaced (FR-CIT-07).
 * It renders what `SourcesProvider` holds and asks it to act.
 */
export function SourcesPanel() {
  const sources = useSources();
  const [first] = sources.pending;
  const asking = first === undefined ? null : sources.lookup(first.citekey);

  return (
    <section aria-labelledby="sources-heading" className="citations__sources">
      <h4 id="sources-heading">{sourcesMessages.heading}</h4>
      <button
        type="button"
        onClick={sources.refresh}
        disabled={!sources.writable || sources.busy}
      >
        {sources.busy ? sourcesMessages.refreshing : sourcesMessages.refresh}
      </button>
      <div role="status" aria-live="polite">
        {sources.message}
      </div>
      {first !== undefined && (
        <div role="alertdialog" aria-labelledby="sources-mismatch-heading">
          <p id="sources-mismatch-heading">
            <strong>{sourcesMessages.mismatchHeading}</strong>
          </p>
          <p>{mismatchText(asking?.label ?? first.citekey)}</p>
          <button type="button" onClick={sources.confirm}>
            {sourcesMessages.replace}
          </button>
          <button type="button" onClick={sources.decline}>
            {sourcesMessages.keep}
          </button>
        </div>
      )}
      {sources.views.length === 0 ? (
        <p>{sourcesMessages.empty}</p>
      ) : (
        <ul className="citations__source-list">
          {sources.views.map((view) => (
            <li key={view.citekey} data-status={view.status}>
              <span>{view.label}</span>{" "}
              <span className="citations__source-status">
                {sourceStatusText(view.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
