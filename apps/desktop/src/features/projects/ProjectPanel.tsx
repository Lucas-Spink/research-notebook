import { useState, type FormEvent } from "react";
import type { RecentEntry } from "../../ipc/bindings";
import { messages } from "./messages";
import { RecentList } from "./RecentList";

type Props = {
  busy: boolean;
  recent: RecentEntry[];
  onCreate: (name: string) => void;
  onOpen: () => void;
  onOpenRecent: (id: string) => void;
  onLocate: (id: string) => void;
};

/** Creating, opening and locating projects (FR-PRJ-01, 02, 03): the "Project" ribbon tab's panel. */
export function ProjectPanel({
  busy,
  recent,
  onCreate,
  onOpen,
  onOpenRecent,
  onLocate,
}: Props) {
  const [name, setName] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate(name);
  }

  return (
    <div className="ribbon__project">
      <form className="projects__create" onSubmit={submit}>
        <label htmlFor="project-name">{messages.nameLabel}</label>
        <input
          id="project-name"
          value={name}
          placeholder={messages.namePlaceholder}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          {messages.createButton}
        </button>
        <button type="button" disabled={busy} onClick={onOpen}>
          {messages.openButton}
        </button>
      </form>

      <div className="ribbon__recent">
        <h3>{messages.recentHeading}</h3>
        <RecentList
          recent={recent}
          busy={busy}
          onOpen={onOpenRecent}
          onLocate={onLocate}
        />
      </div>
    </div>
  );
}
