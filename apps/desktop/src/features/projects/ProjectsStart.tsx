import { useState, type FormEvent } from "react";
import { messages } from "./messages";
import { OpenedPanel } from "./OpenedPanel";
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

  return (
    <section className="projects" aria-labelledby="projects-heading">
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
        {projects.busy && <p>{messages.working}</p>}
        {projects.notices.map((notice) => (
          <p key={notice} className="projects__notice">
            {notice}
          </p>
        ))}
      </div>

      {projects.opened !== null && (
        <OpenedPanel
          project={projects.opened}
          roots={projects.roots}
          busy={projects.busy}
          onChooseRoot={(rootId) => void projects.chooseExternalRoot(rootId)}
        />
      )}

      <h3>{messages.recentHeading}</h3>
      <RecentList
        recent={projects.recent}
        busy={projects.busy}
        onOpen={(id) => void projects.openRecent(id)}
        onLocate={(id) => void projects.locate(id)}
      />
    </section>
  );
}
