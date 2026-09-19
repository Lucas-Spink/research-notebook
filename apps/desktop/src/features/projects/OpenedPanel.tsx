import { messages } from "./messages";
import type { ExternalRoot, OpenedProject } from "./model/flows";
import { ReadOnlyBanner } from "./ReadOnlyBanner";

type Props = {
  project: OpenedProject;
  roots: ExternalRoot[];
  busy: boolean;
  onChooseRoot: (rootId: string) => void;
  onTakeOver: () => void;
  onRetry: () => void;
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
  onTakeOver,
  onRetry,
}: Props) {
  return (
    <section aria-labelledby="opened-heading" className="projects__opened">
      <h2 id="opened-heading">{messages.openedHeading}</h2>
      {project.mode.kind === "readOnly" && (
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
      {roots.length > 0 && (
        <>
          <h3>{messages.externalRootsHeading}</h3>
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
        </>
      )}
    </section>
  );
}
