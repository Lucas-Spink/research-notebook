import { useState, type FormEvent } from "react";
import { useZoteroStatus, ZoteroStatusIndicator } from "../citations";
import { messages } from "./messages";
import type { ExternalRoot, OpenedProject } from "./model/flows";
import { ReadOnlyBanner } from "./ReadOnlyBanner";

type Props = {
  project: OpenedProject;
  roots: ExternalRoot[];
  busy: boolean;
  onChooseRoot: (rootId: string) => void;
  /** Omitted when the project is read-only: a new root cannot be recorded. */
  onAddRoot?: (label: string) => void;
  onTakeOver: () => void;
  onRetry: () => void;
  /** In the ribbon's settings panel: no heading, banner or Zotero status, which the ribbon and the workspace show themselves. */
  compact?: boolean;
};

/**
 * The project that is open, why it is read-only if it is (FR-PRJ-06), and
 * where each of its external roots is on this machine (FR-PRJ-07).
 */
export function OpenedPanel({
  project,
  roots,
  busy,
  onChooseRoot,
  onAddRoot,
  onTakeOver,
  onRetry,
  compact = false,
}: Props) {
  const [label, setLabel] = useState("");
  const zoteroStatus = useZoteroStatus();

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length === 0) return;
    onAddRoot?.(trimmed);
    setLabel("");
  }

  return (
    <section
      {...(compact ? {} : { "aria-labelledby": "opened-heading" })}
      className="projects__opened"
    >
      {!compact && <h2 id="opened-heading">{messages.openedHeading}</h2>}
      {!compact && project.mode.kind === "readOnly" && (
        <ReadOnlyBanner
          reason={project.mode.reason}
          busy={busy}
          onTakeOver={onTakeOver}
          onRetry={onRetry}
        />
      )}
      <p>
        <strong>{project.summary?.name ?? messages.unnamedProject}</strong>
      </p>
      <p>
        {messages.openedAt}:{" "}
        <span className="projects__path">{project.path}</span>
      </p>
      {!compact && <ZoteroStatusIndicator state={zoteroStatus} />}
      {(roots.length > 0 || onAddRoot !== undefined) && (
        <>
          <h3>{messages.externalRootsHeading}</h3>
          {roots.length > 0 && (
            <ul className="projects__recent">
              {roots.map((root) => (
                <li key={root.id}>
                  <div>
                    <strong>{root.label}</strong>
                    <span className="projects__path">
                      {root.path ?? messages.externalRootUnresolved}
                    </span>
                    {root.path !== null && !root.available && (
                      <span className="projects__missing">
                        {messages.externalRootMissing}
                      </span>
                    )}
                  </div>
                  <button disabled={busy} onClick={() => onChooseRoot(root.id)}>
                    {messages.chooseExternalRoot}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {onAddRoot !== undefined && (
            <form className="projects__create" onSubmit={submit}>
              <label htmlFor="add-external-root-label">
                {messages.addExternalRootLabel}
              </label>
              <input
                id="add-external-root-label"
                value={label}
                placeholder={messages.addExternalRootPlaceholder}
                onChange={(event) => setLabel(event.target.value)}
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || label.trim().length === 0}
              >
                {messages.addExternalRootButton}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
