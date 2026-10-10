import { useState } from "react";
import { MenuGlyph } from "./MenuGlyph";
import { resultsMessages } from "./messages";
import { NameForm } from "./NameForm";
import { Popover } from "./Popover";

type Props = {
  anchor: HTMLElement;
  /** The project is read-only: folders cannot be made, but the tree can still be opened and closed. */
  disabled: boolean;
  onNewFolder: (name: string) => Promise<boolean>;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onClose: () => void;
};

/** The menu of the whole tree, opened from the Results heading: a new folder, expand all and collapse all. */
export function TreeMenu({
  anchor,
  disabled,
  onNewFolder,
  onExpandAll,
  onCollapseAll,
  onClose,
}: Props) {
  const [naming, setNaming] = useState(false);
  const done = (act: () => void) => () => {
    act();
    onClose();
  };
  return (
    <Popover
      anchor={anchor}
      label={resultsMessages.treeActions}
      onClose={onClose}
    >
      {naming ? (
        <NameForm
          label={resultsMessages.newGroupLabel}
          placeholder={resultsMessages.newGroupPlaceholder}
          submitLabel={resultsMessages.create}
          disabled={disabled}
          focusOnShow
          onSubmit={async (name) => {
            const saved = await onNewFolder(name);
            if (saved) onClose();
            return saved;
          }}
          onCancel={onClose}
        />
      ) : (
        <ul className="results__menu" role="menu">
          {!disabled && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={() => setNaming(true)}
              >
                <MenuGlyph label="newSubgroup" />
                {resultsMessages.newGroupLabel}
              </button>
            </li>
          )}
          <li>
            <button type="button" role="menuitem" onClick={done(onExpandAll)}>
              <MenuGlyph label="expandAll" />
              {resultsMessages.expandAll}
            </button>
          </li>
          <li>
            <button type="button" role="menuitem" onClick={done(onCollapseAll)}>
              <MenuGlyph label="collapseAll" />
              {resultsMessages.collapseAll}
            </button>
          </li>
        </ul>
      )}
    </Popover>
  );
}
