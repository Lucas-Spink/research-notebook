import {
  FORMAT_VERSION,
  MIGRATIONS,
  parseArtefacts,
  parseProject,
  planMigration,
  projectFormatVersion,
  runMigration,
  type MigrationFiles,
} from "@research-notebook/format";
import type { commands, FolderHandle } from "../../../ipc/bindings";
import { PROJECT_YAML } from "./flows";

/** The commands the migration calls, so tests can supply a fake with the same shape. */
export type MigrateApi = Pick<
  typeof commands,
  | "acquireProjectLock"
  | "releaseProjectLock"
  | "backupForVersionChange"
  | "listNotebookFiles"
  | "readNotebookFile"
  | "writeNotebookFile"
>;

/** Why a project was not migrated. Each leaves every file as it was, or only partly done and safe to run again. */
export type MigrateFailure =
  | "notConfirmed"
  | "lockUnavailable"
  | "backupFailed"
  /** A file could not be listed or read. */
  | "unreadable"
  /** `project.yaml` is not valid even once migrated. */
  | "invalidProject"
  /** Archived projects are migrated when they are unarchived (spec 5.13 rule 5). */
  | "archived"
  /** The project is newer than this build. */
  | "newerFormat"
  | "alreadyCurrent"
  /** A file was changed by something else while this ran. */
  | "changed"
  | "writeFailed";

export type MigrateResult =
  | {
      ok: true;
      /** Artefact files that were not valid, so were left exactly as they were. */
      value: { untouched: string[] };
    }
  | { ok: false; error: MigrateFailure };

type Text = { text: string; sha256: string };

const artefactsPath = (folder: string) =>
  `_notebook/experiments/${folder}/artefacts.yaml`;

async function readText(
  api: MigrateApi,
  folder: FolderHandle,
  path: string,
): Promise<Text | "missing" | "failed"> {
  const read = await api.readNotebookFile(folder, path);
  if (read.status === "error") return "failed";
  return read.data.kind === "text"
    ? { text: read.data.text, sha256: read.data.sha256 }
    : "missing";
}

/** Everything that carries `format_version`, read for the migration to work on. */
type Gathered = { files: Record<string, Text>; project: Text };

async function gather(
  api: MigrateApi,
  folder: FolderHandle,
): Promise<Gathered | "unreadable"> {
  const project = await readText(api, folder, PROJECT_YAML).catch(
    () => "failed",
  );
  if (typeof project === "string") return "unreadable";
  const listed = await api.listNotebookFiles(folder);
  if (listed.status === "error") return "unreadable";
  const files: Record<string, Text> = { [PROJECT_YAML]: project };
  for (const experiment of listed.data.experimentFolders) {
    const path = artefactsPath(experiment);
    const read = await readText(api, folder, path);
    if (read === "failed") return "unreadable";
    if (read !== "missing") files[path] = read;
  }
  return { files, project };
}

/** The project's migrated files, or why they cannot be used. */
function migrated(
  gathered: Gathered,
): { files: MigrationFiles } | { error: MigrateFailure } {
  const version = projectFormatVersion(gathered.project.text);
  if (version === null) return { error: "invalidProject" };
  const plan = planMigration(version, FORMAT_VERSION, MIGRATIONS);
  if (!plan.ok) {
    return {
      error: plan.error.kind === "newer" ? "newerFormat" : "invalidProject",
    };
  }
  if (plan.value.length === 0) return { error: "alreadyCurrent" };
  const texts = Object.fromEntries(
    Object.entries(gathered.files).map(([path, file]) => [path, file.text]),
  );
  const files = runMigration(texts, plan.value);
  const project = parseProject(files[PROJECT_YAML] ?? "");
  if (!project.ok) return { error: "invalidProject" };
  if (project.value.archived !== null) return { error: "archived" };
  return { files };
}

/**
 * Brings an older project up to this build's format (spec 5.13 rules 3 to 5,
 * ADR-0064), only once the person has confirmed. The lock is taken first, the
 * files are checked, and the version-change backup is made before anything is
 * written. Artefact files are written first and `project.yaml` last, so a run
 * that stops part-way leaves the project at its old version and can simply be
 * run again; the edit is idempotent.
 *
 * A file that is not valid is left exactly as it was and reported, as every
 * other code path does with a file that fails to parse. On success the lock is
 * kept, so the project can open for editing straight away.
 */
export async function migrateProjectFlow(input: {
  api: MigrateApi;
  folder: FolderHandle;
  confirmed: boolean;
}): Promise<MigrateResult> {
  const { api, folder, confirmed } = input;
  if (!confirmed) return { ok: false, error: "notConfirmed" };
  const locked = await api.acquireProjectLock(folder, false).catch(() => null);
  if (
    locked === null ||
    locked.status !== "ok" ||
    locked.data.kind !== "acquired"
  ) {
    return { ok: false, error: "lockUnavailable" };
  }
  const giveUp = async (error: MigrateFailure): Promise<MigrateResult> => {
    await api.releaseProjectLock(folder).catch(() => undefined);
    return { ok: false, error };
  };

  const gathered = await gather(api, folder).catch(() => "unreadable" as const);
  if (gathered === "unreadable") return giveUp("unreadable");
  const result = migrated(gathered);
  if ("error" in result) return giveUp(result.error);

  const backup = await api.backupForVersionChange(folder).catch(() => null);
  if (backup === null || backup.status !== "ok") return giveUp("backupFailed");

  const untouched: string[] = [];
  const order = Object.keys(result.files).filter(
    (path) => path !== PROJECT_YAML,
  );
  for (const path of [...order, PROJECT_YAML]) {
    const before = gathered.files[path];
    const after = result.files[path];
    if (before === undefined || after === undefined || after === before.text) {
      continue;
    }
    if (path !== PROJECT_YAML && !parseArtefacts(after).ok) {
      untouched.push(path);
      continue;
    }
    const written = await api
      .writeNotebookFile(folder, path, after, {
        kind: "sha256",
        sha256: before.sha256,
      })
      .catch(() => null);
    if (written === null || written.status === "error") {
      return giveUp("writeFailed");
    }
    if (written.data.kind === "changed") return giveUp("changed");
  }
  return { ok: true, value: { untouched } };
}
