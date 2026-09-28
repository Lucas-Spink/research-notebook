import { formatSize } from "../../preview";
import {
  discoveryMessages,
  evidenceMessages,
  scanSummary,
} from "./evidenceMessages";
import { discoveredKey } from "./model/discovery";
import type { Discovery } from "./useDiscovery";

/**
 * Choosing a folder, editing include and exclude globs, scanning with
 * progress and cancel, and reviewing what was found (FR-EVD-09, ADR-0035,
 * ADR-0044 point 7). Renders nothing once the dialog is closed.
 */
export function DiscoveryDialog({ discovery }: { discovery: Discovery }) {
  const { stage } = discovery;

  const notes = discovery.notes.length > 0 && (
    <div className="discovery__notes" role="status" aria-live="polite">
      <ul>
        {discovery.notes.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ul>
      <button type="button" onClick={discovery.dismiss}>
        {evidenceMessages.dismiss}
      </button>
    </div>
  );

  if (stage.kind === "closed") return notes || null;

  return (
    <>
      {notes}
      <div
        className="discovery"
        role="dialog"
        aria-label={discoveryMessages.heading}
      >
        {stage.kind === "pickingFolder" && (
          <p>{discoveryMessages.chooseFolder}</p>
        )}

        {stage.kind === "editingOptions" && (
          <>
            <p>{stage.label}</p>
            <label>
              {discoveryMessages.includeLabel}
              <textarea
                value={discovery.includeText}
                onChange={(event) =>
                  discovery.setIncludeText(event.target.value)
                }
              />
            </label>
            <label>
              {discoveryMessages.excludeLabel}
              <textarea
                value={discovery.excludeText}
                onChange={(event) =>
                  discovery.setExcludeText(event.target.value)
                }
              />
            </label>
            <button type="button" onClick={() => void discovery.scan()}>
              {discoveryMessages.scan}
            </button>
            <button type="button" onClick={() => void discovery.close()}>
              {discoveryMessages.close}
            </button>
          </>
        )}

        {stage.kind === "scanning" && (
          <>
            <p>{stage.label}</p>
            <p role="status" aria-live="polite">
              {discoveryMessages.scanning}
              {stage.progress !== null &&
                ` (${stage.progress.filesSeen ?? 0} files, ${stage.progress.foldersSeen ?? 0} folders)`}
            </p>
            <button type="button" onClick={() => void discovery.cancel()}>
              {discoveryMessages.cancel}
            </button>
          </>
        )}

        {stage.kind === "reviewing" && (
          <>
            <p>{stage.label}</p>
            <p>
              {scanSummary(
                stage.result.foldersVisited ?? 0,
                stage.result.skipped ?? 0,
              )}
            </p>
            {stage.result.cancelled && <p>{discoveryMessages.cancelled}</p>}
            {stage.result.files.length === 0 ? (
              <p>{discoveryMessages.noFiles}</p>
            ) : (
              <>
                <button type="button" onClick={discovery.selectAll}>
                  {discoveryMessages.selectAll}
                </button>
                <button type="button" onClick={discovery.selectNone}>
                  {discoveryMessages.selectNone}
                </button>
                <ul className="discovery__files">
                  {stage.result.files.map((file) => {
                    const key = discoveredKey(file);
                    return (
                      <li key={key}>
                        <label>
                          <input
                            type="checkbox"
                            checked={stage.selected.has(key)}
                            onChange={() => discovery.toggle(key)}
                          />
                          {file.name} ({formatSize(file.size ?? 0)})
                          {file.captured && (
                            <span> {discoveryMessages.alreadyCaptured}</span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  onClick={() => void discovery.addSelected()}
                >
                  {discoveryMessages.addSelected}
                </button>
              </>
            )}
            <button type="button" onClick={() => void discovery.close()}>
              {discoveryMessages.close}
            </button>
          </>
        )}
      </div>
    </>
  );
}
