import {
  commands,
  events,
  type EvidenceDragged,
  type EvidenceDropped,
  type FolderHandle,
} from "../../../ipc/bindings";

/** Stops listening. */
export type Unlisten = () => void;

/**
 * What receiving files dropped on the window needs (ADR-0044 point 2): Rust
 * is told which project drops are for, and reports the pointer and the
 * dropped files as locations. Tests stand in for it.
 */
export type DropsApi = {
  watch: (
    folder: FolderHandle,
    projectId: string,
    externalRoots: string[],
  ) => Promise<void>;
  unwatch: () => Promise<void>;
  onDragged: (handler: (event: EvidenceDragged) => void) => Promise<Unlisten>;
  onDropped: (handler: (event: EvidenceDropped) => void) => Promise<Unlisten>;
};

/** The application's own commands and events. */
export const evidenceDrops: DropsApi = {
  watch: async (folder, projectId, externalRoots) => {
    await commands.watchDrops(folder, projectId, externalRoots);
  },
  unwatch: () => commands.unwatchDrops(),
  onDragged: (handler) =>
    events.evidenceDragged.listen((event) => handler(event.payload)),
  onDropped: (handler) =>
    events.evidenceDropped.listen((event) => handler(event.payload)),
};
