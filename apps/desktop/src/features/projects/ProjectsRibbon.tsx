import type { ReactNode } from "react";
import { messages } from "./messages";

export type RibbonTab = "project" | "roots";

type Props = {
  tab: RibbonTab;
  expanded: boolean;
  /** Whether the External roots tab has anything to show yet (a project is open). */
  showRootsTab: boolean;
  onTab: (tab: RibbonTab) => void;
  onToggle: () => void;
  projectPanel: ReactNode;
  rootsPanel: ReactNode;
};

/**
 * The tab strip that stands in for the old, always-open create/open and
 * external-roots forms (FR-PRJ-01 to 03, FR-PRJ-07): tabs, in the way a word
 * processor's ribbon has them, that expand a panel of controls on demand
 * instead of taking permanent space above the table. Opening a project
 * collapses it, since the questions and experiments are then the point of
 * the page.
 */
export function ProjectsRibbon({
  tab,
  expanded,
  showRootsTab,
  onTab,
  onToggle,
  projectPanel,
  rootsPanel,
}: Props) {
  return (
    <div className="ribbon">
      <div
        className="ribbon__tabs"
        role="tablist"
        aria-label={messages.heading}
      >
        <button
          type="button"
          role="tab"
          id="ribbon-tab-project"
          aria-selected={tab === "project"}
          aria-controls="ribbon-panel"
          className="ribbon__tab"
          onClick={() => onTab("project")}
        >
          {messages.projectTab}
        </button>
        {showRootsTab && (
          <button
            type="button"
            role="tab"
            id="ribbon-tab-roots"
            aria-selected={tab === "roots"}
            aria-controls="ribbon-panel"
            className="ribbon__tab"
            onClick={() => onTab("roots")}
          >
            {messages.externalRootsHeading}
          </button>
        )}
        <button
          type="button"
          className="ribbon__toggle"
          aria-expanded={expanded}
          aria-controls="ribbon-panel"
          onClick={onToggle}
        >
          <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
          <span className="projects__sr">
            {expanded ? messages.collapseRibbon : messages.expandRibbon}
          </span>
        </button>
      </div>
      {expanded && (
        <div
          id="ribbon-panel"
          role="tabpanel"
          aria-labelledby={
            tab === "project" ? "ribbon-tab-project" : "ribbon-tab-roots"
          }
          className="ribbon__panel"
        >
          {tab === "project" ? projectPanel : rootsPanel}
        </div>
      )}
    </div>
  );
}
