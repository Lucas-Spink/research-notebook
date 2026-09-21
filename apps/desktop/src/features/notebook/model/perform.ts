import type {
  NotebookError,
  NotebookState,
  Plan,
  Result,
  Step,
} from "@research-notebook/format";
import type { FolderHandle } from "../../../ipc/bindings";
import { discardEdits, edit, saveFailed, saved, saving } from "../../conflicts";
import type { FirstWriteGuard } from "../../history";
import { sha256Hex } from "../../../shared/sha256";
import type { ChangesPort, Loaded, WriteApi } from "./api";

/** What carrying out an operation needs. */
export type Deps = {
  api: WriteApi;
  folder: FolderHandle;
  guard: FirstWriteGuard;
  changes: ChangesPort;
  /** This window holds the project's lock. The backend refuses otherwise; this saves the call. */
  writable: boolean;
};

export type Performed =
  /** Every step was written; `loaded` is what the disk now holds. */
  | { kind: "done"; loaded: Loaded }
  /** The format refused the values, so nothing was written. */
  | { kind: "refused"; error: NotebookError }
  /** Nothing was written: the project is read-only, or the backup that must come first failed. */
  | { kind: "notWritten"; reason: "notWritable" | "backupFailed" }
  /**
   * A step failed or found the file changed by someone else, after `written`
   * steps had been made. The caller reads the disk again; nothing is undone,
   * because every order of steps is one a reload can make sense of (ADR-0026).
   */
  | { kind: "interrupted"; reason: "changed" | "failed"; written: number };

/** The files whose changes the watcher is asked about: the ones the notebook reads. */
function isHeld(path: string): boolean {
  return (
    path === "_notebook/project.yaml" ||
    /^_notebook\/questions\/[^/]+\.md$/.test(path) ||
    /^_notebook\/experiments\/[^/]+\/experiment\.md$/.test(path)
  );
}

type Failed = { ok: false; reason: "changed" | "failed" | "notWritable" };
type Written = { ok: true; sha256: string } | Failed;

/**
 * Writes one file. The hash of what will be on disk is marked as expected
 * before the write starts, because the watcher may report the write before it
 * is confirmed and it must not be taken for someone else's edit (ADR-0024).
 */
async function writeFile(
  deps: Deps,
  loaded: Loaded,
  step: Extract<Step, { kind: "create" | "replace" }>,
): Promise<Written> {
  const { path, text } = step;
  const sha256 = sha256Hex(text);
  const base = step.kind === "replace" ? (loaded.hashes[path] ?? null) : null;
  if (step.kind === "replace" && base === null) {
    // Not read from disk: writing would be a guess about what it holds.
    return { ok: false, reason: "changed" };
  }
  const held = isHeld(path);
  if (held) {
    deps.changes.track(path, base);
    deps.changes.update(path, (tracked) => saving(edit(tracked, text), sha256));
  }
  const failed = (reason: "changed" | "failed" | "notWritable"): Written => {
    if (held) {
      deps.changes.update(path, (tracked) =>
        discardEdits(saveFailed(tracked, sha256)),
      );
      if (step.kind === "create") deps.changes.untrack(path);
    }
    return { ok: false, reason };
  };
  const expected =
    base === null
      ? ({ kind: "absent" } as const)
      : ({ kind: "sha256", sha256: base } as const);
  const result = await deps.api.writeNotebookFile(
    deps.folder,
    path,
    text,
    expected,
  );
  if (result.status === "error") {
    return failed(
      result.error.kind === "notWritable" ? "notWritable" : "failed",
    );
  }
  if (result.data.kind === "changed") return failed("changed");
  if (held) deps.changes.update(path, (tracked) => saved(tracked, sha256));
  return { ok: true, sha256 };
}

/** Moves `path` to the trash. `null` when it was moved, otherwise why not. */
async function trash(deps: Deps, path: string): Promise<Failed | null> {
  // Stop watching first: the files going away are ours, not an outside change.
  deps.changes.untrack(`${path}/experiment.md`);
  deps.changes.untrack(path);
  const result = await deps.api.moveToTrash(deps.folder, path);
  if (result.status === "ok") return null;
  return {
    ok: false,
    reason: result.error.kind === "notWritable" ? "notWritable" : "failed",
  };
}

/** Steps that leave the project unchanged and the state as it was. */
const nothingToDo = (loaded: Loaded): Performed => ({ kind: "done", loaded });

/**
 * Carries out a plan in order, and stops at the first step that does not
 * succeed. Files are only ever created where none exists and replaced where
 * they are still what was read, so an outside edit is never overwritten
 * (ADR-0025 point 3). The version-change backup is made before the first
 * write (ADR-0025 point 8).
 */
export async function applyPlan(
  deps: Deps,
  loaded: Loaded,
  plan: Plan,
): Promise<Performed> {
  if (plan.steps.length === 0) return nothingToDo(loaded);
  if (!deps.writable) return { kind: "notWritten", reason: "notWritable" };
  const guarded = await deps.guard.beforeWrite();
  if (!guarded.ok) return { kind: "notWritten", reason: "backupFailed" };

  const hashes: Record<string, string> = { ...loaded.hashes };
  let written = 0;
  for (const step of plan.steps) {
    if (step.kind === "trash") {
      const trashed = await trash(deps, step.path);
      if (trashed !== null) return failure(trashed.reason, written);
      for (const path of Object.keys(hashes)) {
        if (path === step.path || path.startsWith(`${step.path}/`))
          delete hashes[path];
      }
    } else {
      const done = await writeFile(deps, { ...loaded, hashes }, step);
      if (!done.ok) return failure(done.reason, written);
      if (isHeld(step.path)) hashes[step.path] = done.sha256;
    }
    written += 1;
  }
  return { kind: "done", loaded: { state: plan.next, hashes } };
}

function failure(
  reason: "changed" | "failed" | "notWritable",
  written: number,
): Performed {
  if (reason === "notWritable" && written === 0) {
    return { kind: "notWritten", reason: "notWritable" };
  }
  return {
    kind: "interrupted",
    reason: reason === "changed" ? "changed" : "failed",
    written,
  };
}

/**
 * Plans an operation on the state as it was loaded and carries it out. A
 * refusal from the format (an empty title, an unknown question) writes
 * nothing.
 */
export async function perform(
  deps: Deps,
  loaded: Loaded,
  operation: (state: NotebookState) => Result<Plan, NotebookError>,
): Promise<Performed> {
  const planned = operation(loaded.state);
  if (!planned.ok) return { kind: "refused", error: planned.error };
  return applyPlan(deps, loaded, planned.value);
}
