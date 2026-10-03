import { useState } from "react";
import { CitationPicker } from "./CitationPicker";
import {
  attachLabel,
  detachLabel,
  mismatchText,
  repairMessages,
  sourceStatusText,
  sourcesMessages,
} from "./messages";
import { useSources } from "./SourcesContext";
import type { RepairModel } from "./useSourceRepair";

/**
 * Attaching sources to one experiment from the list (S6-T01): a source is
 * attached when the experiment cites it, so attaching writes a citation and
 * detaching takes its citations out.
 */
export type AttachModel = {
  /** Names the experiment, for the buttons' accessible names. */
  target: string;
  /** Citekeys the experiment already cites. */
  attached: ReadonlySet<string>;
  busy: boolean;
  onAttach: (citekey: string) => void;
  onDetach: (citekey: string) => void;
};

/**
 * The project's cached sources with their state, the refresh action and the
 * prompt shown before data from a different Zotero is replaced (FR-CIT-07).
 * With a `repair` model, a missing or trashed source can be replaced with
 * another item (FR-CIT-08). It renders what `SourcesProvider` holds and asks
 * it to act.
 */
export function SourcesPanel({
  repair,
  attach,
}: {
  repair?: RepairModel;
  attach?: AttachModel;
}) {
  const sources = useSources();
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const shown = sources.views.filter(
    (view) =>
      needle === "" ||
      view.label.toLowerCase().includes(needle) ||
      view.citekey.toLowerCase().includes(needle),
  );
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
      <label className="citations__source-filter">
        {sourcesMessages.filterLabel}{" "}
        <input
          type="search"
          value={filter}
          placeholder={sourcesMessages.filterPlaceholder}
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      {sources.views.length === 0 ? (
        <p>{sourcesMessages.empty}</p>
      ) : shown.length === 0 ? (
        <p>{sourcesMessages.noMatches}</p>
      ) : (
        <ul className="citations__source-list">
          {shown.map((view) => (
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
              {attach !== undefined && (
                <>
                  {" "}
                  {attach.attached.has(view.citekey) ? (
                    <button
                      type="button"
                      disabled={attach.busy}
                      aria-label={detachLabel(view.label, attach.target)}
                      onClick={() => attach.onDetach(view.citekey)}
                    >
                      {sourcesMessages.detach}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={attach.busy}
                      aria-label={attachLabel(view.label, attach.target)}
                      onClick={() => attach.onAttach(view.citekey)}
                    >
                      {sourcesMessages.attach}
                    </button>
                  )}
                </>
              )}
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
