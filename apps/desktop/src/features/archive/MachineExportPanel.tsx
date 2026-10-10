import {
  failedFilesNote,
  machineExportMessages,
  machineExported,
} from "./messages";
import type { MachineExportModel } from "./useMachineExport";

/**
 * Writes the machine-readable export (FR-ARC-07). It is opt-in, renders what
 * `useMachineExport` holds and writes only through it. A failed run is shown
 * as a failure and claims no files.
 */
export function MachineExportPanel({ model }: { model: MachineExportModel }) {
  const { state, outcome, failure, writable, ready } = model;
  const label =
    state === "running"
      ? machineExportMessages.writing
      : state === "idle"
        ? machineExportMessages.write
        : machineExportMessages.again;
  return (
    <section
      className="machine-export"
      aria-labelledby="machine-export-heading"
    >
      <h4 id="machine-export-heading">{machineExportMessages.heading}</h4>
      <p>{machineExportMessages.intro}</p>
      {!writable && <p>{machineExportMessages.readOnly}</p>}
      {!ready && <p>{machineExportMessages.notLoaded}</p>}
      <button
        type="button"
        disabled={state === "running" || !writable || !ready}
        onClick={model.run}
      >
        {label}
      </button>
      <div role="status" aria-live="polite">
        {state === "idle" && machineExportMessages.notWritten}
        {state === "done" && outcome !== null && machineExported(outcome)}
      </div>
      {state === "failed" && failure !== null && (
        <p role="alert">{machineExportMessages.failures[failure]}</p>
      )}
      {state === "done" &&
        outcome !== null &&
        outcome.failedFiles.length > 0 && (
          <p role="alert">{failedFilesNote(outcome.failedFiles)}</p>
        )}
    </section>
  );
}
