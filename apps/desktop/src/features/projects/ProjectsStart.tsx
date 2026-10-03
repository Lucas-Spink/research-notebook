import { useState, type FormEvent } from "react";
import { ConflictPanel } from "../conflicts";
import { NotebookPanel } from "../notebook";
import { messages } from "./messages";
import { OpenedPanel } from "./OpenedPanel";
import { ProjectRibbonControls } from "./ProjectRibbonControls";
import { ReadOnlyBanner } from "./ReadOnlyBanner";
import { RecentList } from "./RecentList";
import { useProjects } from "./useProjects";
import "./ProjectsStart.css";

/** Create, open and locate projects (FR-PRJ-01, 02, 03 and 07). */
export function ProjectsStart() {
  const projects = useProjects();
  const [name, setName] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    void projects.create(name);
  }

  const { opened } = projects;
  if (opened !== null && opened.summary !== null) {
    // An open project is the whole window: ribbon, table and side pane.
    return (
      <NotebookPanel
        folder={opened.folder}
        writable={opened.mode.kind === "writable"}
        changes={projects.fileChanges}
        projectControls={<ProjectRibbonControls projects={projects} />}
        projectBanners={
          <>
            {opened.mode.kind === "readOnly" && (
              <ReadOnlyBanner
                reason={opened.mode.reason}
                busy={projects.busy}
                onTakeOver={() => void projects.takeOver()}
                onRetry={() => void projects.retryLock()}
              />
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
            <ConflictPanel
              files={projects.changed}
              onResolve={projects.resolveConflict}
            />
          </>
        }
      />
    );
  }

  return (
    <section className="projects container" aria-labelledby="projects-heading">
      <h1>{messages.appTitle}</h1>
      <div className="projects__narrow">
        <h2 id="projects-heading">{messages.heading}</h2>

        <form className="projects__create" onSubmit={submit}>
          <label htmlFor="project-name">{messages.nameLabel}</label>
          <input
            id="project-name"
            value={name}
            placeholder={messages.namePlaceholder}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" disabled={projects.busy}>
            {messages.createButton}
          </button>
          <button
            type="button"
            disabled={projects.busy}
            onClick={() => void projects.open()}
          >
            {messages.openButton}
          </button>
        </form>

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
          <OpenedPanel
            project={projects.opened}
            roots={projects.roots}
            busy={projects.busy}
            onChooseRoot={(rootId) => void projects.chooseExternalRoot(rootId)}
            onTakeOver={() => void projects.takeOver()}
            onRetry={() => void projects.retryLock()}
            {...(projects.opened.mode.kind === "writable"
              ? {
                  onAddRoot: (label: string) =>
                    void projects.addExternalRoot(label),
                }
              : {})}
          />
        )}
      </div>

      <div className="projects__narrow">
        <h3>{messages.recentHeading}</h3>
        <RecentList
          recent={projects.recent}
          busy={projects.busy}
          onOpen={(id) => void projects.openRecent(id)}
          onLocate={(id) => void projects.locate(id)}
        />
      </div>
    </section>
  );
}
