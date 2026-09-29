import { useState, type FormEvent } from "react";
import { messages } from "./messages";
import type { ExternalRoot } from "./model/flows";

type Props = {
  roots: ExternalRoot[];
  busy: boolean;
  onChooseRoot: (rootId: string) => void;
  /** Omitted when the project is read-only: a new root cannot be recorded. */
  onAddRoot?: (label: string) => void;
};

/**
 * Where each of the open project's external roots is on this machine
 * (FR-PRJ-07): the "External roots" ribbon tab's panel.
 */
export function ExternalRootsPanel({
  roots,
  busy,
  onChooseRoot,
  onAddRoot,
}: Props) {
  const [label, setLabel] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length === 0) return;
    onAddRoot?.(trimmed);
    setLabel("");
  }

  return (
    <div className="ribbon__roots">
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
          <button type="submit" disabled={busy || label.trim().length === 0}>
            {messages.addExternalRootButton}
          </button>
        </form>
      )}
    </div>
  );
}
