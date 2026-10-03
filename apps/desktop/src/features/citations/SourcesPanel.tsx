import { CitationPicker } from "./CitationPicker";
import {
  mismatchText,
  repairMessages,
  sourceStatusText,
  sourcesMessages,
} from "./messages";
import { useSources } from "./SourcesContext";
import type { RepairModel } from "./useSourceRepair";

/**
 * The project's cached sources with their state, the refresh action and the
 * prompt shown before data from a different Zotero is replaced (FR-CIT-07).
 * With a `repair` model, a missing or trashed source can be replaced with
 * another item (FR-CIT-08). It renders what `SourcesProvider` holds and asks
 * it to act.
 */
export function SourcesPanel({ repair }: { repair?: RepairModel }) {
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
      {repair?.choosing != null && (
        <CitationPicker
          mode="replace"
          exclude={repair.choosing}
          onInsert={() => undefined}
          onInsertCitekeys={([replacement]) => {
            if (replacement !== undefined) repair.choose(replacement);
          }}
          onCancel={repair.cancel}
        />
      )}
      {repair !== undefined && (
        <div role="status" aria-live="polite">
          {repair.message}
        </div>
      )}
      {sources.views.length === 0 ? (
        <p>{sourcesMessages.empty}</p>
      ) : (
        <ul className="citations__source-list">
          {sources.views.map((view) => (
            <li key={view.citekey} data-status={view.status}>
              <button
                type="button"
                className="citations__source-open"
                onClick={() => sources.select(view.citekey)}
              >
                {view.label}
              </button>{" "}
              <span className="citations__source-status">
                {sourceStatusText(view.status)}
              </span>
              {repair?.canReplace(view.status) === true && (
                <>
                  {" "}
                  <button
                    type="button"
                    aria-label={`${repairMessages.action} ${view.label}`}
                    onClick={() => repair.start(view.citekey)}
                  >
                    {repairMessages.action}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
