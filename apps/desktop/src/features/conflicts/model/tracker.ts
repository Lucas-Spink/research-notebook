/**
 * Keeping what a person has typed and what someone else left on disk apart,
 * so neither is lost (FR-HIS-05, AC-11, ADR-0024).
 *
 * A pure model, like the flows in `features/projects/model`: it does no I/O
 * and holds no clock. Each function takes the state of one notebook file and
 * returns the next state, and where the caller must act (read the file
 * again) it says so in `effects`. The watcher reports what is on disk by
 * content hash; the model compares hashes, never text, so it needs nothing
 * from the file until a conflict has to be shown.
 */

/**
 * What is on disk for a notebook file, as the watcher reported it. Mirrors
 * the `state` of a `ChangedFile` in the generated bindings.
 */
export type Disk =
  | { kind: "present"; sha256: string }
  | { kind: "missing" }
  | { kind: "unreadable" };

/** A file's text and the SHA-256 of its bytes, as `readNotebookFile` returns them. */
export type FileText = { text: string; sha256: string };

/** The other side of a conflict: what someone else left on disk. */
export type Theirs =
  | { kind: "loading" }
  | { kind: "present"; text: string; sha256: string }
  | { kind: "missing" };

/**
 * The person's unsaved text and someone else's version of the file, both
 * kept. The local text is `Tracked.unsaved`, not repeated here.
 */
export type Conflict = { theirs: Theirs };

/** A save that has started: the hash of what is being written, and its text. */
export type Saving = { sha256: string; text: string };

/** What the application holds in memory for one notebook file. */
export type Tracked = {
  /** Project-relative, such as `_notebook/questions/Q-01.md`. */
  path: string;
  /**
   * The hash of the disk version this buffer was loaded from or last saved
   * as; `null` if there was no file.
   */
  base: string | null;
  /** The text with edits not yet saved, or `null` if there are none. */
  unsaved: string | null;
  /**
   * Saves under way. The watcher reports the application's own writes like
   * anyone else's, and may do so before the save is confirmed; a report
   * matching one of these is that save's echo, not an outside change.
   */
  saving: Saving[];
  conflict: Conflict | null;
};

/** Something the caller must do, because the model does no I/O. */
export type Effect =
  /** Buffer is clean: read the file and replace the buffer with it. */
  | { kind: "reload"; path: string }
  /** Buffer is clean: the file was removed. */
  | { kind: "gone"; path: string }
  /** A conflict began or their version changed: read the file for the view. */
  | { kind: "loadTheirs"; path: string };

export type Step = { tracked: Tracked; effects: Effect[] };

/** What the person's choice in the conflict view means for the buffer. */
export type Resolution =
  /** Nothing to resolve yet: no conflict, or their text is still being read. */
  | { kind: "pending" }
  /** Keep the local text. Saving it overwrites their version, knowingly. */
  | { kind: "keepMine"; text: string }
  /** Take their version (`null`: they removed the file) and drop the local text. */
  | { kind: "useTheirs"; file: FileText | null; discarded: string };

export type Keep = "mine" | "theirs";

/** Starts tracking a file loaded at hash `base` (`null` if there was none). */
export function track(path: string, base: string | null): Tracked {
  return { path, base, unsaved: null, saving: [], conflict: null };
}

/** The buffer now holds `text`, which is not saved. */
export function edit(tracked: Tracked, text: string): Tracked {
  return { ...tracked, unsaved: text };
}

/**
 * The person reverted the buffer to what was loaded. Refused while a conflict
 * is open: that is settled in the conflict view, where both sides are shown.
 */
export function discardEdits(tracked: Tracked): Tracked {
  return tracked.conflict === null ? { ...tracked, unsaved: null } : tracked;
}

/**
 * A save of the current text is about to be written; `sha256` is the hash of
 * the bytes that will be on disk.
 */
export function saving(tracked: Tracked, sha256: string): Tracked {
  const started = tracked.unsaved;
  if (started === null) return tracked;
  return {
    ...tracked,
    saving: [
      ...tracked.saving.filter((s) => s.sha256 !== sha256),
      { sha256, text: started },
    ],
  };
}

/**
 * The save was written. The buffer is now based on it, and its text is no
 * longer unsaved unless more was typed while it was being written. Ignored
 * during a conflict, which must be resolved first.
 */
export function saved(tracked: Tracked, sha256: string): Tracked {
  if (tracked.conflict !== null) return tracked;
  const done = tracked.saving.find((s) => s.sha256 === sha256);
  return {
    ...tracked,
    base: sha256,
    unsaved:
      done !== undefined && tracked.unsaved === done.text
        ? null
        : tracked.unsaved,
    saving: tracked.saving.filter((s) => s.sha256 !== sha256),
  };
}

/** The save failed: the text stays unsaved and its echo is no longer expected. */
export function saveFailed(tracked: Tracked, sha256: string): Tracked {
  return {
    ...tracked,
    saving: tracked.saving.filter((s) => s.sha256 !== sha256),
  };
}

/**
 * The watcher reported the file. A file with no unsaved edits is reloaded; a
 * file with them starts a conflict, and the local text is never touched.
 */
export function external(tracked: Tracked, disk: Disk): Step {
  if (disk.kind === "unreadable") return { tracked, effects: [] };
  const sha = disk.kind === "present" ? disk.sha256 : null;
  if (tracked.saving.some((s) => s.sha256 === sha)) {
    return { tracked, effects: [] };
  }
  if (sha === tracked.base) {
    // What the buffer is based on: an echo, a touch, or them putting it back.
    return { tracked: { ...tracked, conflict: null }, effects: [] };
  }
  if (tracked.unsaved === null) {
    const kind = disk.kind === "present" ? "reload" : "gone";
    return { tracked, effects: [{ kind, path: tracked.path }] };
  }
  return {
    tracked: { ...tracked, conflict: { theirs: { kind: "loading" } } },
    effects: [{ kind: "loadTheirs", path: tracked.path }],
  };
}

/** Their side as a conflict holds it, or `null` if it is what the buffer is based on. */
function conflictFor(tracked: Tracked, file: FileText | null): Conflict | null {
  const sha = file?.sha256 ?? null;
  if (sha === tracked.base) return null;
  return {
    theirs:
      file === null
        ? { kind: "missing" }
        : { kind: "present", text: file.text, sha256: file.sha256 },
  };
}

/**
 * A reload asked for by `external` has been read (`null`: the file is gone).
 * If the person typed in the meantime the read becomes a conflict, so the
 * new text is never allowed to replace what was typed.
 */
export function reloaded(tracked: Tracked, file: FileText | null): Tracked {
  if (tracked.unsaved === null) {
    return { ...tracked, base: file?.sha256 ?? null, conflict: null };
  }
  return { ...tracked, conflict: conflictFor(tracked, file) };
}

/** Their text for an open conflict has been read (`null`: they removed the file). */
export function theirsLoaded(tracked: Tracked, file: FileText | null): Tracked {
  if (tracked.conflict === null) return tracked;
  return { ...tracked, conflict: conflictFor(tracked, file) };
}

/**
 * The person chose a side. Both are still held until now, so nothing is
 * discarded that they did not choose to. The caller carries the choice out:
 * keeping mine leaves the text in the buffer, based on their version, so
 * saving it replaces theirs; using theirs replaces the buffer.
 */
export function resolve(
  tracked: Tracked,
  keep: Keep,
): { tracked: Tracked; resolution: Resolution } {
  const pending = { tracked, resolution: { kind: "pending" } as const };
  const theirs = tracked.conflict?.theirs;
  if (theirs === undefined || theirs.kind === "loading") return pending;
  if (tracked.unsaved === null) return pending;
  const base = theirs.kind === "present" ? theirs.sha256 : null;
  if (keep === "mine") {
    return {
      tracked: { ...tracked, base, conflict: null },
      resolution: { kind: "keepMine", text: tracked.unsaved },
    };
  }
  return {
    tracked: { ...tracked, base, unsaved: null, conflict: null },
    resolution: {
      kind: "useTheirs",
      file:
        theirs.kind === "present"
          ? { text: theirs.text, sha256: theirs.sha256 }
          : null,
      discarded: tracked.unsaved,
    },
  };
}
