import { useEffect, useRef, useState } from "react";
import { ConflictPanel } from "../conflicts";
import { NotebookPanel } from "../notebook";
import { ExternalRootsPanel } from "./ExternalRootsPanel";
import { messages } from "./messages";
import { ProjectPanel } from "./ProjectPanel";
import { ProjectsRibbon, type RibbonTab } from "./ProjectsRibbon";
import { ReadOnlyBanner } from "./ReadOnlyBanner";
import { useProjects } from "./useProjects";
import "./ProjectsStart.css";

/** Create, open and locate projects (FR-PRJ-01, 02, 03 and 07). */
export function ProjectsStart() {
  const projects = useProjects();
  const [tab, setTab] = useState<RibbonTab>("project");
  const [expanded, setExpanded] = useState(projects.opened === null);
  // Collapses the ribbon the first time a project opens, so the table is
  // the focus of the page from then on; later openings leave it as the
  // person left it.
  const collapsedOnOpen = useRef(false);
  useEffect(() => {
    if (projects.opened !== null && !collapsedOnOpen.current) {
      collapsedOnOpen.current = true;
      setExpanded(false);
    }
  }, [projects.opened]);

  return (
    <section className="projects" aria-labelledby="projects-heading">
      <h2 id="projects-heading" className="projects__sr">
        {messages.heading}
      </h2>

      <ProjectsRibbon
        tab={tab}
        expanded={expanded}
        showRootsTab={projects.opened !== null}
        onTab={(chosen) => {
          setTab(chosen);
          setExpanded(true);
        }}
        onToggle={() => setExpanded((current) => !current)}
        projectPanel={
          <ProjectPanel
            busy={projects.busy}
            recent={projects.recent}
            onCreate={(name) => void projects.create(name)}
            onOpen={() => void projects.open()}
            onOpenRecent={(id) => void projects.openRecent(id)}
            onLocate={(id) => void projects.locate(id)}
          />
        }
        rootsPanel={
          <ExternalRootsPanel
            roots={projects.roots}
            busy={projects.busy}
            onChooseRoot={(rootId) => void projects.chooseExternalRoot(rootId)}
            {...(projects.opened?.mode.kind === "writable"
              ? {
                  onAddRoot: (label: string) =>
                    void projects.addExternalRoot(label),
                }
              : {})}
          />
        }
      />

      <div className="projects__narrow">
        <div role="status" aria-live="polite">
          {projects.busy && (
            <p>
              <span className="spinner" aria-hidden="true" />
              {messages.working}
            </p>
          )}
          {projects.notices.map((notice) => (
            <p key={notice} className="projects__notice notice">
              <span>{notice}</span>
              <button
                type="button"
                className="notice__dismiss"
                aria-label={messages.dismiss}
                onClick={() => projects.dismissNotices()}
              >
                ×
              </button>
            </p>
          ))}
        </div>

        <ConflictPanel
          files={projects.changed}
          onResolve={projects.resolveConflict}
        />

        {projects.opened !== null && (
          <>
            {projects.opened.mode.kind === "readOnly" && (
              <ReadOnlyBanner
                reason={projects.opened.mode.reason}
                busy={projects.busy}
                onTakeOver={() => void projects.takeOver()}
                onRetry={() => void projects.retryLock()}
              />
            )}
            <p className="projects__status-line">
              <strong>
                {projects.opened.summary?.name ?? messages.unnamedProject}
              </strong>
              <span className="projects__path"> · {projects.opened.path}</span>
            </p>
          </>
        )}
      </div>

      {projects.opened !== null && projects.opened.summary !== null && (
        <NotebookPanel
          folder={projects.opened.folder}
          writable={projects.opened.mode.kind === "writable"}
          changes={projects.fileChanges}
        />
      )}
    </section>
  );
}
