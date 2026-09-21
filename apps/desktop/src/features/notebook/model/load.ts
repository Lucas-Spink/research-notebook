import {
  parseExperiment,
  parseProject,
  parseQuestion,
  PROJECT_PATH,
  type LoadedExperiment,
  type LoadedQuestion,
} from "@research-notebook/format";
import type { FolderHandle } from "../../../ipc/bindings";
import type { Loaded, ReadApi } from "./api";

export type LoadFailure = "projectFile" | "unavailable";

export type LoadOutcome =
  { ok: true; value: Loaded } | { ok: false; reason: LoadFailure };

/** How many files are asked for at once, so a large project does not flood the command queue. */
const AT_ONCE = 16;

/** What reading one file found. */
type Read =
  | { kind: "text"; text: string; sha256: string }
  | { kind: "missing" }
  | { kind: "unreadable" };

async function readFile(
  api: ReadApi,
  folder: FolderHandle,
  path: string,
): Promise<Read> {
  try {
    const result = await api.readNotebookFile(folder, path);
    if (result.status === "error") return { kind: "unreadable" };
    return result.data.kind === "text"
      ? { kind: "text", text: result.data.text, sha256: result.data.sha256 }
      : { kind: "missing" };
  } catch {
    // A name the command refuses to take arrives as a rejection, not a typed error.
    return { kind: "unreadable" };
  }
}

async function inGroups<T, R>(
  items: readonly T[],
  each: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += AT_ONCE) {
    const group = items.slice(start, start + AT_ONCE);
    results.push(...(await Promise.all(group.map(each))));
  }
  return results;
}

const stem = (fileName: string) => fileName.replace(/\.md$/, "");

/**
 * Reads `project.yaml`, every question and every experiment of the project
 * (nothing is written) and parses them with `packages/format`.
 *
 * A file that cannot be read or parsed is left out and reported in
 * `unreadable`, and its name is kept in `reservedRefs` so its ref is not given
 * out again. It is never repaired or rewritten (AGENTS.md rule 5). A folder
 * with no `experiment.md` also keeps its name. `project.yaml` itself has to be
 * usable, or nothing is loaded.
 */
export async function loadNotebook(
  api: ReadApi,
  folder: FolderHandle,
): Promise<LoadOutcome> {
  const projectFile = await readFile(api, folder, PROJECT_PATH);
  if (projectFile.kind !== "text") return { ok: false, reason: "projectFile" };
  const project = parseProject(projectFile.text);
  if (!project.ok) return { ok: false, reason: "projectFile" };

  const listed = await api
    .listNotebookFiles(folder)
    .catch(() => ({ status: "error" as const }));
  if (listed.status === "error") return { ok: false, reason: "unavailable" };

  const hashes: Record<string, string> = { [PROJECT_PATH]: projectFile.sha256 };
  const questions: LoadedQuestion[] = [];
  const experiments: LoadedExperiment[] = [];
  const reservedRefs: string[] = [];
  const unreadable: string[] = [];

  const questionReads = await inGroups(
    listed.data.questionFiles,
    async (name) => {
      const path = `_notebook/questions/${name}`;
      return { name, path, read: await readFile(api, folder, path) };
    },
  );
  for (const { name, path, read } of questionReads) {
    if (read.kind === "missing") continue;
    const parsed = read.kind === "text" ? parseQuestion(read.text) : null;
    if (read.kind === "text" && parsed?.ok) {
      questions.push({ fileName: name, file: parsed.value });
      hashes[path] = read.sha256;
    } else {
      unreadable.push(path);
      reservedRefs.push(stem(name));
    }
  }

  const experimentReads = await inGroups(
    listed.data.experimentFolders,
    async (name) => {
      const path = `_notebook/experiments/${name}/experiment.md`;
      return { name, path, read: await readFile(api, folder, path) };
    },
  );
  for (const { name, path, read } of experimentReads) {
    const parsed = read.kind === "text" ? parseExperiment(read.text) : null;
    if (read.kind === "text" && parsed?.ok) {
      experiments.push({ folder: name, file: parsed.value });
      hashes[path] = read.sha256;
      continue;
    }
    // Kept whether the file is missing, unreadable or invalid: the name holds a ref.
    reservedRefs.push(name);
    if (read.kind !== "missing") unreadable.push(path);
  }

  return {
    ok: true,
    value: {
      state: {
        project: project.value,
        questions,
        experiments,
        reservedRefs,
        unreadable,
      },
      hashes,
    },
  };
}
