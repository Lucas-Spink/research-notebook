import type { ChangesPort } from "./api";

/**
 * Makes the watcher hold exactly the files that were just read, each from
 * the hash it was read at: files that are gone are let go, and a file that was
 * held is held again from the new hash, so nothing stale is compared against.
 * Nothing is held for a file with unsaved edits, because the notebook keeps
 * none: it writes at once (ADR-0026).
 */
export function holdFiles(
  port: ChangesPort,
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): void {
  for (const path of Object.keys(before)) {
    if (!(path in after)) port.untrack(path);
  }
  for (const [path, base] of Object.entries(after)) {
    port.untrack(path);
    port.track(path, base);
  }
}
