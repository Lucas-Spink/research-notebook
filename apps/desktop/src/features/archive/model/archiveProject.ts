import {
  FORMAT_VERSION,
  MIGRATIONS,
  markArchived,
  markUnarchived,
  parseProject,
  planMigration,
  serialiseProject,
  type Migration,
  type Result,
} from "@research-notebook/format";
import type { commands, FolderHandle } from "../../../ipc/bindings";

/** The commands archiving goes through, so tests can supply a fake with the same shape. */
export type ArchiveApi = Pick<
  typeof commands,
  | "readNotebookFile"
  | "writeNotebookFile"
  | "backupForVersionChange"
  | "acquireProjectLock"
  | "releaseProjectLock"
>;

const PROJECT_YAML = "_notebook/project.yaml";

/** Why a project was not archived. Nothing but the flag is ever written. */
export type ArchiveFailure =
  "unreadable" | "alreadyArchived" | "changed" | "writeFailed";

/** Why a project was not unarchived. `project.yaml` is untouched in every case. */
export type UnarchiveFailure =
  | "notConfirmed"
  | "unreadable"
  | "notArchived"
  | "lockUnavailable"
  | "backupFailed"
  | "migrationNeeded"
  | "changed"
  | "writeFailed";

type Read = { ok: true; text: string; sha256: string } | { ok: false };

async function readProjectFile(
  api: ArchiveApi,
  folder: FolderHandle,
): Promise<Read> {
  const read = await api.readNotebookFile(folder, PROJECT_YAML);
  if (read.status !== "ok" || read.data.kind !== "text") return { ok: false };
  return { ok: true, text: read.data.text, sha256: read.data.sha256 };
}

/** Writes `text` over the `project.yaml` that was read, never over a changed one. */
async function writeProjectFile(
  api: ArchiveApi,
  folder: FolderHandle,
  text: string,
  sha256: string,
): Promise<"saved" | "changed" | "writeFailed"> {
  const written = await api.writeNotebookFile(folder, PROJECT_YAML, text, {
    kind: "sha256",
    sha256,
  });
  if (written.status !== "ok") return "writeFailed";
  return written.data.kind === "saved" ? "saved" : "changed";
}

/**
 * Marks the open project archived (FR-ARC-09): `archived` in `project.yaml`
 * is the only thing written. The caller then reloads the file, which makes
 * the project read-only and lets go of its lock. Needs the lock now, so a
 * read-only project is refused by the write itself.
 */
export async function archiveProject(input: {
  api: ArchiveApi;
  folder: FolderHandle;
  now: () => Date;
}): Promise<Result<string, ArchiveFailure>> {
  const { api, folder, now } = input;
  const file = await readProjectFile(api, folder).catch(() => null);
  if (file === null || !file.ok) return { ok: false, error: "unreadable" };
  const parsed = parseProject(file.text);
  if (!parsed.ok) return { ok: false, error: "unreadable" };
  if (parsed.value.archived !== null) {
    return { ok: false, error: "alreadyArchived" };
  }
  const archived = markArchived(parsed.value, now);
  const outcome = await writeProjectFile(
    api,
    folder,
    serialiseProject(archived),
    file.sha256,
  ).catch(() => "writeFailed" as const);
  if (outcome !== "saved" || archived.archived === null) {
    return { ok: false, error: outcome === "saved" ? "writeFailed" : outcome };
  }
  return { ok: true, value: archived.archived };
}

/**
 * Brings an archived project back into use (FR-ARC-10, spec 5.13 rule 5), only
 * once the person has confirmed. An archived project holds no lock, so it is
 * asked for first; then the version-change backup is made; then any migration
 * is checked for; and only then is the flag cleared. If anything before the
 * write fails, the lock is given up again and the project stays archived.
 * Migration steps that change notebook files do not exist yet (format
 * version 1 is the only one), so a plan with steps is refused unrun.
 */
export async function unarchiveProject(input: {
  api: ArchiveApi;
  folder: FolderHandle;
  appVersion: string;
  confirmed: boolean;
  migrations?: readonly Migration[];
  target?: number;
}): Promise<Result<undefined, UnarchiveFailure>> {
  const { api, folder, appVersion, confirmed } = input;
  if (!confirmed) return { ok: false, error: "notConfirmed" };
  const file = await readProjectFile(api, folder).catch(() => null);
  if (file === null || !file.ok) return { ok: false, error: "unreadable" };
  const parsed = parseProject(file.text);
  if (!parsed.ok) return { ok: false, error: "unreadable" };
  if (parsed.value.archived === null) {
    return { ok: false, error: "notArchived" };
  }
  const locked = await api.acquireProjectLock(folder, false).catch(() => null);
  if (locked === null || locked.status !== "ok") {
    return { ok: false, error: "lockUnavailable" };
  }
  if (locked.data.kind !== "acquired") {
    return { ok: false, error: "lockUnavailable" };
  }
  const giveUp = async (error: UnarchiveFailure) => {
    await api.releaseProjectLock(folder).catch(() => undefined);
    return { ok: false, error } as const;
  };

  const backup = await api.backupForVersionChange(folder).catch(() => null);
  if (backup === null || backup.status !== "ok") {
    return giveUp("backupFailed");
  }
  const plan = planMigration(
    parsed.value.format_version,
    input.target ?? FORMAT_VERSION,
    input.migrations ?? MIGRATIONS,
  );
  if (!plan.ok || plan.value.length > 0) return giveUp("migrationNeeded");

  const outcome = await writeProjectFile(
    api,
    folder,
    serialiseProject(markUnarchived(parsed.value, appVersion)),
    file.sha256,
  ).catch(() => "writeFailed" as const);
  if (outcome !== "saved") return giveUp(outcome);
  return { ok: true, value: undefined };
}
