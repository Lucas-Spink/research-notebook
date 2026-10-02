import {
  Citekey,
  markSourceMissing,
  parseBibliography,
  parseCslJsonItem,
  serialiseBibliography,
  upsertSource,
  type BibliographyFileModel,
  type ServerMismatch,
} from "@research-notebook/format";
import type { commands, FolderHandle } from "../../../ipc/bindings";

/** The commands a sync uses, so tests can supply a fake with the same shape. */
export type SourcesApi = Pick<
  typeof commands,
  "zoteroFetchSource" | "readNotebookFile" | "writeNotebookFile"
>;

export const BIBLIOGRAPHY_PATH = "_notebook/bibliography.json";

export type SyncDeps = {
  api: SourcesApi;
  folder: FolderHandle;
  now: () => Date;
  /** Citekeys whose different-server data the person agreed to overwrite (FR-CIT-07). */
  confirmed?: ReadonlySet<string>;
};

/** What a sync did, by citekey. `failed` and `unconfirmed` sources were left as they were. */
export type SyncOutcome =
  | {
      kind: "done";
      added: string[];
      updated: string[];
      unchanged: string[];
      missing: string[];
      /** Held data came from another Zotero; asks the person before overwriting. */
      mismatches: ServerMismatch[];
      /** Zotero answered 412, so the stored data could not be confirmed. */
      unconfirmed: string[];
      failed: string[];
      bibliography: BibliographyFileModel;
    }
  | { kind: "offline"; reason: "notRunning" | "disabled" }
  /** `bibliography.json` does not parse; it is left untouched (AGENTS.md rule 5). */
  | { kind: "unreadable" }
  | { kind: "notWritable" }
  /** The file changed on disk since it was read; nothing was written. */
  | { kind: "changed" }
  | { kind: "failed" };

type Loaded = { file: BibliographyFileModel; sha256: string | null };

async function load(deps: SyncDeps): Promise<Loaded | "unreadable" | "failed"> {
  try {
    const read = await deps.api.readNotebookFile(
      deps.folder,
      BIBLIOGRAPHY_PATH,
    );
    if (read.status === "error") return "failed";
    if (read.data.kind === "missing") return { file: [], sha256: null };
    const parsed = parseBibliography(read.data.text);
    return parsed.ok
      ? { file: parsed.value, sha256: read.data.sha256 }
      : "unreadable";
  } catch {
    return "failed";
  }
}

type Tally = Omit<
  Extract<SyncOutcome, { kind: "done" }>,
  "kind" | "bibliography"
>;

function emptyTally(): Tally {
  return {
    added: [],
    updated: [],
    unchanged: [],
    missing: [],
    mismatches: [],
    unconfirmed: [],
    failed: [],
  };
}

type Step =
  | { kind: "file"; file: BibliographyFileModel }
  | { kind: "offline"; reason: "notRunning" | "disabled" };

/** Fetches one source and merges it, recording what happened in `tally`. */
async function syncOne(
  deps: SyncDeps,
  file: BibliographyFileModel,
  citekey: string,
  tally: Tally,
): Promise<Step> {
  const valid = Citekey.safeParse(citekey);
  const itemKey = valid.success ? citekey.split(":")[2] : undefined;
  if (itemKey === undefined) {
    tally.failed.push(citekey);
    return { kind: "file", file };
  }
  let fetched;
  try {
    fetched = await deps.api.zoteroFetchSource(itemKey);
  } catch {
    tally.failed.push(citekey);
    return { kind: "file", file };
  }
  if (fetched.status === "error") {
    switch (fetched.error.kind) {
      case "notRunning":
      case "disabled":
        return { kind: "offline", reason: fetched.error.kind };
      case "preconditionFailed":
        tally.unconfirmed.push(citekey);
        break;
      case "requestFailed":
        tally.failed.push(citekey);
        break;
    }
    return { kind: "file", file };
  }
  if (fetched.data.kind === "missing") {
    const next = markSourceMissing(file, citekey);
    if (next.change === "updated") tally.missing.push(citekey);
    else if (file.some((item) => item.id === citekey)) {
      tally.unchanged.push(citekey);
    } else tally.failed.push(citekey);
    return { kind: "file", file: next.file };
  }
  const csl = parseCslJsonItem(fetched.data.cslJson);
  const [, library, key] = citekey.split(":");
  if (!csl.ok || library === undefined || key === undefined) {
    tally.failed.push(citekey);
    return { kind: "file", file };
  }
  const merged = upsertSource(
    file,
    {
      library,
      key,
      serverId: fetched.data.serverId,
      trashed: fetched.data.trashed,
      csl: csl.value,
    },
    deps.now,
    { confirmServerChange: deps.confirmed?.has(citekey) === true },
  );
  if (!merged.ok) {
    tally.mismatches.push(merged.error);
    return { kind: "file", file };
  }
  tally[merged.value.change === "added" ? "added" : merged.value.change].push(
    citekey,
  );
  return { kind: "file", file: merged.value.file };
}

async function save(
  deps: SyncDeps,
  loaded: Loaded,
  file: BibliographyFileModel,
): Promise<"saved" | "notWritable" | "changed" | "failed"> {
  const expected =
    loaded.sha256 === null
      ? ({ kind: "absent" } as const)
      : ({ kind: "sha256", sha256: loaded.sha256 } as const);
  try {
    const result = await deps.api.writeNotebookFile(
      deps.folder,
      BIBLIOGRAPHY_PATH,
      serialiseBibliography(file),
      expected,
    );
    if (result.status === "error") {
      return result.error.kind === "notWritable" ? "notWritable" : "failed";
    }
    return result.data.kind === "changed" ? "changed" : "saved";
  } catch {
    return "failed";
  }
}

/**
 * Adds or refreshes the given sources in `bibliography.json` (FR-CIT-05,
 * FR-CIT-07) with a single guarded write. Called after a citation is
 * inserted and by the refresh action. Nothing is written when Zotero is
 * unreachable, the file does not parse, or nothing changed; the file is
 * never replaced if it changed on disk since it was read. A source whose
 * stored data came from a different Zotero is reported in `mismatches` and
 * left alone until it is passed again in `confirmed`.
 */
export async function syncSources(
  deps: SyncDeps,
  citekeys: readonly string[],
): Promise<SyncOutcome> {
  const loaded = await load(deps);
  if (loaded === "unreadable") return { kind: "unreadable" };
  if (loaded === "failed") return { kind: "failed" };

  const tally = emptyTally();
  let file = loaded.file;
  for (const citekey of citekeys) {
    const step = await syncOne(deps, file, citekey, tally);
    if (step.kind === "offline") return step;
    file = step.file;
  }
  if (file !== loaded.file) {
    const saved = await save(deps, loaded, file);
    if (saved !== "saved") return { kind: saved };
  }
  return { kind: "done", ...tally, bibliography: file };
}
