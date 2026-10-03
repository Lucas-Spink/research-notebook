import { useState, type FormEvent } from "react";
import { useZoteroStatus, ZoteroStatusIndicator } from "../citations";
import { RibbonMenu } from "../../shared/ribbon";
import { messages } from "./messages";
import { OpenedPanel } from "./OpenedPanel";
import { RecentList } from "./RecentList";
import type { Projects } from "./useProjects";

/** The ribbon's Project group (S6-T01): new, open and recent projects, the open project's settings and external roots, and Zotero's status. */
export function ProjectRibbonControls({ projects }: { projects: Projects }) {
  const [name, setName] = useState("");
  const zoteroStatus = useZoteroStatus();
  const { opened } = projects;

  function submit(event: FormEvent, close: () => void) {
    event.preventDefault();
    void projects.create(name);
    close();
  }

  return (
    <>
      <RibbonMenu label={messages.createHeading}>
        {(close) => (
          <form className="ribbon__form" onSubmit={(e) => submit(e, close)}>
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
          </form>
        )}
      </RibbonMenu>
      <button
        type="button"
        className="ribbon__button"
        disabled={projects.busy}
        onClick={() => void projects.open()}
      >
        {messages.openButton}
      </button>
      <RibbonMenu label={messages.recentHeading}>
        {(close) => (
          <RecentList
            recent={projects.recent}
            busy={projects.busy}
            onOpen={(id) => {
              close();
              void projects.openRecent(id);
            }}
            onLocate={(id) => void projects.locate(id)}
          />
        )}
      </RibbonMenu>
      {opened !== null && (
        <RibbonMenu label={messages.settingsButton}>
          <OpenedPanel
            compact
            project={opened}
            roots={projects.roots}
            busy={projects.busy}
            onChooseRoot={(rootId) => void projects.chooseExternalRoot(rootId)}
            onTakeOver={() => void projects.takeOver()}
            onRetry={() => void projects.retryLock()}
            {...(opened.mode.kind === "writable"
              ? {
                  onAddRoot: (label: string) =>
                    void projects.addExternalRoot(label),
                }
              : {})}
          />
        </RibbonMenu>
      )}
      <RibbonMenu label={messages.zoteroButton}>
        <ZoteroStatusIndicator state={zoteroStatus} />
      </RibbonMenu>
    </>
  );
}
