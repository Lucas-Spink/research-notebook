import { events, type ChangeReport } from "../../../ipc/bindings";

/**
 * Passes what the watcher found on to the pop-out canvas window (ADR-0066).
 * This window is the only one that polls the watcher, which hands each batch
 * out once, so the canvas window hears of changes only through this. With no
 * other window listening, or nothing to send to, nothing happens.
 */
export function relayChanges(report: ChangeReport): void {
  events.projectFilesChanged
    .emit({
      paths: report.changes.map((change) => change.path),
      needsRescan: report.needsRescan,
    })
    .catch(() => undefined);
}
