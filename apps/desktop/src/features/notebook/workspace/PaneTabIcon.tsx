import type { ArtefactModel } from "@research-notebook/format";
import { ArtefactTypeIcon, FolderIcon } from "../../../shared/ArtefactTypeIcon";
import { assertNever } from "../../../shared/assertNever";
import type { PaneTab } from "./model/panes";

type Props = {
  tab: PaneTab;
  /** What kind of file a result tab shows, so its icon is that file's. */
  artefactType: ArtefactModel["type"] | null;
};

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="artefact-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    >
      {children}
    </svg>
  );
}

/**
 * A small square icon for a pane tab, for the rail the pane folds into
 * (S6-T01): a result shows the icon of its file type, and each tool its own
 * glyph. Decorative: the button around it carries the tab's name.
 */
export function PaneTabIcon({ tab, artefactType }: Props) {
  switch (tab.kind) {
    case "result":
      return <ArtefactTypeIcon type={artefactType ?? "other"} />;
    case "results":
      return <FolderIcon />;
    case "sources":
      return (
        <Glyph>
          <path d="M3 2.5h8a1 1 0 0 1 1 1v10H4a1 1 0 0 1-1-1v-10Z" />
          <path d="M5.5 5.5h4M5.5 8h4" />
        </Glyph>
      );
    case "search":
      return (
        <Glyph>
          <circle cx="7" cy="7" r="3.5" />
          <path d="M9.8 9.8L13 13" />
        </Glyph>
      );
    case "citations":
      return (
        <Glyph>
          <path d="M3.5 6.5h3v3h-3zM9.5 6.5h3v3h-3z" />
          <path d="M6.5 9.5c0 1.5-1 2.5-2.5 3M12.5 9.5c0 1.5-1 2.5-2.5 3" />
        </Glyph>
      );
    case "details":
      return (
        <Glyph>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 7.5v3.5M8 5.2h.01" />
        </Glyph>
      );
    case "addResult":
      return (
        <Glyph>
          <path d="M8 3.5v9M3.5 8h9" />
        </Glyph>
      );
    default:
      return assertNever(tab);
  }
}
