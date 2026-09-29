import { citationPickerMessages } from "../../citations/messages";
import "./SlashMenu.css";

/** One slash-menu item. Only "cite" exists today (FR-CIT-03); more can be added later. */
export type SlashMenuItem = {
  id: "cite";
  label: string;
  description: string;
};

export const CITE_MENU_ITEM: SlashMenuItem = {
  id: "cite",
  label: citationPickerMessages.citeItemLabel,
  description: citationPickerMessages.citeItemDescription,
};

export type SlashMenuProps = {
  /** The listbox's own id, so the editor can point `aria-owns`/`aria-activedescendant` at it. */
  id: string;
  items: readonly SlashMenuItem[];
  /** Index of the keyboard-highlighted item, kept and moved outside this component. */
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (item: SlashMenuItem) => void;
};

/** An item's DOM id, for `aria-activedescendant`. */
export function slashMenuOptionId(listId: string, index: number): string {
  return `${listId}-option-${index}`;
}

/**
 * The `/` slash menu (FR-CIT-03): an ARIA `listbox` opened by `CiteSuggestion`.
 * Purely presentational — keyboard navigation and the match list live in
 * `CiteSuggestion.ts`'s `@tiptap/suggestion` wiring, since key events arrive
 * at the editor, not at this popup.
 */
export function SlashMenu({
  id,
  items,
  activeIndex,
  onHover,
  onSelect,
}: SlashMenuProps) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={citationPickerMessages.slashMenuLabel}
      className="slash-menu"
    >
      {items.length === 0 ? (
        <li role="presentation" className="slash-menu__empty">
          {citationPickerMessages.empty}
        </li>
      ) : (
        items.map((item, index) => (
          <li
            key={item.id}
            id={slashMenuOptionId(id, index)}
            role="option"
            aria-selected={index === activeIndex}
            className={
              index === activeIndex
                ? "slash-menu__option slash-menu__option--active"
                : "slash-menu__option"
            }
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              // Keep focus (and the current selection) in the editor.
              event.preventDefault();
              onSelect(item);
            }}
          >
            <span className="slash-menu__label">{item.label}</span>
            <span className="slash-menu__description">{item.description}</span>
          </li>
        ))
      )}
    </ul>
  );
}
