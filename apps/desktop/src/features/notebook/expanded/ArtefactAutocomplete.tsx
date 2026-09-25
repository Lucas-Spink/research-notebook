import {
  artefactAutocompleteMessages,
  artefactTypeLabel,
  artefactVersionLabel,
} from "../messages";
import type { ArtefactSearchRow } from "./model/artefactSearch";
import { ArtefactTypeIcon } from "./ArtefactTypeIcon";
import "./ArtefactAutocomplete.css";

export type ArtefactAutocompleteProps = {
  /** The listbox's own id, so the editor can point `aria-owns`/`aria-activedescendant` at it. */
  id: string;
  rows: readonly ArtefactSearchRow[];
  /** Index of the keyboard-highlighted row, kept and moved outside this component. */
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (row: ArtefactSearchRow) => void;
};

/** An option's DOM id, for `aria-activedescendant` (FR-EDT-04's ARIA combobox). */
export function artefactOptionId(listId: string, index: number): string {
  return `${listId}-option-${index}`;
}

/**
 * The @ autocomplete's popup (FR-EDT-04): an ARIA `listbox` of the
 * experiment's copy-mode artefacts matching the query, each showing a type
 * icon, its group path and its latest version. Purely presentational —
 * keyboard navigation, the query and the match list live in
 * `liveEditorExtensions.ts`'s `@tiptap/suggestion` wiring, since key
 * events arrive at the editor, not at this popup.
 */
export function ArtefactAutocomplete({
  id,
  rows,
  activeIndex,
  onHover,
  onSelect,
}: ArtefactAutocompleteProps) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={artefactAutocompleteMessages.label}
      className="artefact-autocomplete"
    >
      {rows.length === 0 ? (
        <li role="presentation" className="artefact-autocomplete__empty">
          {artefactAutocompleteMessages.empty}
        </li>
      ) : (
        rows.map((row, index) => (
          <li
            key={row.id}
            id={artefactOptionId(id, index)}
            role="option"
            aria-selected={index === activeIndex}
            className={
              index === activeIndex
                ? "artefact-autocomplete__option artefact-autocomplete__option--active"
                : "artefact-autocomplete__option"
            }
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              // Keep focus (and the current selection) in the editor.
              event.preventDefault();
              onSelect(row);
            }}
          >
            <ArtefactTypeIcon type={row.type} />
            <span className="artefact-autocomplete__label">{row.label}</span>
            <span className="artefact-autocomplete__meta">
              {artefactTypeLabel(row.type)} ·{" "}
              {row.groupPath ?? artefactAutocompleteMessages.ungrouped} ·{" "}
              {artefactVersionLabel(row.version)}
            </span>
          </li>
        ))
      )}
    </ul>
  );
}
