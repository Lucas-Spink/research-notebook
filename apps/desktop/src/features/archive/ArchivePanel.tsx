import { archiveMessages as text, describeWhen } from "./archiveMessages";
import type { ArchiveModel } from "./useArchiveProject";

/** The message for a failure, by which action was attempted. */
function failureText(model: ArchiveModel): string | null {
  const { failure, archived } = model;
  if (failure === null) return null;
  const table: Readonly<Record<string, string>> =
    archived === null ? text.archiveFailures : text.unarchiveFailures;
  return table[failure] ?? null;
}

/**
 * Archives the project, or unarchives it after a confirmation (FR-ARC-09,
 * FR-ARC-10). It renders what `useArchiveProject` holds and acts only through
 * it.
 */
export function ArchivePanel({ model }: { model: ArchiveModel }) {
  const { archived, writable, confirming, running } = model;
  return (
    <section className="archive" aria-labelledby="archive-heading">
      <h4 id="archive-heading">{text.heading}</h4>
      {archived === null ? (
        <>
          <p>{text.introActive}</p>
          {!writable && <p>{text.readOnly}</p>}
          <button
            type="button"
            disabled={running || !writable}
            onClick={model.archive}
          >
            {running ? text.archiving : text.archive}
          </button>
        </>
      ) : (
        <>
          <p>{text.archived(describeWhen(archived))}</p>
          <button
            type="button"
            disabled={running || confirming}
            onClick={model.askToUnarchive}
          >
            {running ? text.unarchiving : text.unarchive}
          </button>
          {confirming && (
            <div role="alertdialog" aria-labelledby="unarchive-heading">
              <h5 id="unarchive-heading">{text.confirmHeading}</h5>
              <p>{text.confirmBody}</p>
              <button type="button" onClick={model.confirmUnarchive}>
                {text.confirm}
              </button>
              <button type="button" onClick={model.cancel}>
                {text.cancel}
              </button>
            </div>
          )}
        </>
      )}
      <div role="status" aria-live="polite">
        {failureText(model)}
      </div>
    </section>
  );
}
