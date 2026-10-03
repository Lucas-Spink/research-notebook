import { useId, useState } from "react";
import { commands } from "../../ipc/bindings";
import {
  citationPickerMessages,
  citationSearchStatusText,
  locatorTermLabel,
} from "./messages";
import {
  buildCitationMarkdown,
  LOCATOR_TERMS,
  newSelectionItem,
  toggleSelection,
  updateSelection,
  type CitationSelectionItem,
  type LocatorTerm,
} from "./model/citationSelection";
import type { CitationSearchApi } from "./model/citationSearchApi";
import { useCitationSearch } from "./useCitationSearch";
import "./CitationPicker.css";

export type CitationPickerProps = {
  /** Called with spec 5.7's bracketed citation text once the person confirms. */
  onInsert: (markdown: string) => void;
  /** Called with the inserted sources' citekeys, so they can be cached in `bibliography.json` (FR-CIT-05). */
  onInsertCitekeys?: (citekeys: readonly string[]) => void;
  /** Called on Cancel or Escape; nothing is inserted. */
  onCancel: () => void;
  /**
   * `replace` chooses exactly one source to stand in for another (FR-CIT-08):
   * no locator, prefix or suffix, and `onInsertCitekeys` is called with that one
   * citekey. Defaults to `cite`.
   */
  mode?: "cite" | "replace";
  /** A citekey to leave out of the results, such as the source being replaced. */
  exclude?: string;
  /** Overridable for tests; defaults to the real IPC commands. */
  api?: CitationSearchApi;
};

/**
 * The citation picker (FR-CIT-03): debounced Zotero search, multi-select,
 * and per-item locator, prefix and suffix, composed into spec 5.7's
 * bracketed Pandoc citation text on Insert. Fully keyboard-operable: every
 * control is a native, labelled form element, reachable by Tab and
 * operable by Space/Enter, and Escape cancels from anywhere in the dialog.
 */
export function CitationPicker({
  onInsert,
  onInsertCitekeys,
  onCancel,
  mode = "cite",
  exclude,
  api = commands,
}: CitationPickerProps) {
  const replacing = mode === "replace";
  const id = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CitationSelectionItem[]>([]);
  const state = useCitationSearch(query, api);

  const isSelected = (citekey: string) =>
    selected.some((item) => item.citekey === citekey);

  const toggle = (citekey: string, title: string) => {
    setSelected((current) =>
      replacing
        ? [newSelectionItem(citekey, title)]
        : toggleSelection(current, newSelectionItem(citekey, title)),
    );
  };

  const update = (
    citekey: string,
    changes: Partial<
      Pick<
        CitationSelectionItem,
        "locatorTerm" | "locatorValue" | "prefix" | "suffix"
      >
    >,
  ) => {
    setSelected((current) => updateSelection(current, citekey, changes));
  };

  const insert = () => {
    if (selected.length === 0) return;
    onInsert(replacing ? "" : buildCitationMarkdown(selected));
    onInsertCitekeys?.(selected.map((item) => item.citekey));
  };

  const rows =
    state.kind === "ok"
      ? state.rows.filter((row) => row.citekey !== exclude)
      : [];
  const statusText =
    state.kind === "ok"
      ? rows.length === 0
        ? citationPickerMessages.empty
        : null
      : citationSearchStatusText(state);

  const dialogLabel = replacing
    ? citationPickerMessages.replaceDialogLabel
    : citationPickerMessages.dialogLabel;

  return (
    <div
      role="dialog"
      aria-label={dialogLabel}
      className="citation-picker"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <h6 className="citation-picker__heading">{dialogLabel}</h6>

      <label className="citation-picker__label" htmlFor={`${id}-search`}>
        {citationPickerMessages.searchLabel}
      </label>
      <input
        id={`${id}-search`}
        type="text"
        autoFocus
        placeholder={citationPickerMessages.searchPlaceholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {statusText !== null && (
        <p role="status" className="citation-picker__status">
          {statusText}
        </p>
      )}

      {state.kind === "ok" && rows.length > 0 && (
        <ul
          aria-label={citationPickerMessages.resultsLabel}
          className="citation-picker__results"
        >
          {rows.map((row) => (
            <li key={row.citekey} className="citation-picker__result">
              <label>
                <input
                  type={replacing ? "radio" : "checkbox"}
                  name={replacing ? `${id}-replacement` : undefined}
                  checked={isSelected(row.citekey)}
                  onChange={() => toggle(row.citekey, row.title)}
                />
                <span className="citation-picker__result-title">
                  {row.title}
                </span>
                {row.creatorSummary !== null && (
                  <span className="citation-picker__result-meta">
                    {row.creatorSummary}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}

      {!replacing && selected.length > 0 && (
        <div className="citation-picker__selected">
          <h6 className="citation-picker__heading">
            {citationPickerMessages.selectedHeading}
          </h6>
          <ul>
            {selected.map((item, index) => (
              <li key={item.citekey} className="citation-picker__selected-item">
                <span className="citation-picker__selected-title">
                  {item.title}
                </span>

                <label htmlFor={`${id}-locator-term-${index}`}>
                  {citationPickerMessages.locatorTermLabel}
                </label>
                <select
                  id={`${id}-locator-term-${index}`}
                  value={item.locatorTerm ?? ""}
                  onChange={(event) =>
                    update(item.citekey, {
                      locatorTerm:
                        event.target.value === ""
                          ? null
                          : (event.target.value as LocatorTerm),
                    })
                  }
                >
                  <option value="">{locatorTermLabel(null)}</option>
                  {LOCATOR_TERMS.map((term) => (
                    <option key={term} value={term}>
                      {locatorTermLabel(term)}
                    </option>
                  ))}
                </select>

                <label htmlFor={`${id}-locator-value-${index}`}>
                  {citationPickerMessages.locatorValueLabel}
                </label>
                <input
                  id={`${id}-locator-value-${index}`}
                  type="text"
                  placeholder={citationPickerMessages.locatorValuePlaceholder}
                  value={item.locatorValue}
                  onChange={(event) =>
                    update(item.citekey, { locatorValue: event.target.value })
                  }
                />

                <label htmlFor={`${id}-prefix-${index}`}>
                  {citationPickerMessages.prefixLabel}
                </label>
                <input
                  id={`${id}-prefix-${index}`}
                  type="text"
                  placeholder={citationPickerMessages.prefixPlaceholder}
                  value={item.prefix}
                  onChange={(event) =>
                    update(item.citekey, { prefix: event.target.value })
                  }
                />

                <label htmlFor={`${id}-suffix-${index}`}>
                  {citationPickerMessages.suffixLabel}
                </label>
                <input
                  id={`${id}-suffix-${index}`}
                  type="text"
                  placeholder={citationPickerMessages.suffixPlaceholder}
                  value={item.suffix}
                  onChange={(event) =>
                    update(item.citekey, { suffix: event.target.value })
                  }
                />

                <button
                  type="button"
                  aria-label={citationPickerMessages.removeSelected}
                  onClick={() => toggle(item.citekey, item.title)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="citation-picker__actions">
        <button type="button" onClick={onCancel}>
          {citationPickerMessages.cancel}
        </button>
        <button type="button" disabled={selected.length === 0} onClick={insert}>
          {replacing
            ? citationPickerMessages.useSource
            : citationPickerMessages.insert}
        </button>
      </div>
    </div>
  );
}
