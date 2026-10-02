import {
  parseBibliography,
  type BibliographyFileModel,
  type ServerMismatch,
} from "@research-notebook/format";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { commands, type FolderHandle } from "../../ipc/bindings";
import { sourcesMessages, syncSummary } from "./messages";
import { sourceView, sourceLookup, type SourceView } from "./model/sourceView";
import {
  BIBLIOGRAPHY_PATH,
  syncSources,
  type SourcesApi,
  type SyncOutcome,
} from "./model/syncSources";

/** What the sources list, the refresh action and citations in text share. */
export type SourcesModel = {
  /** Cached sources, in file order; empty until read. */
  views: readonly SourceView[];
  /** The same sources as `bibliography.json` holds them, for rendering the Literature block (FR-CIT-06). */
  items: BibliographyFileModel;
  lookup: (citekey: string) => SourceView | null;
  busy: boolean;
  writable: boolean;
  /** The last result, for a status region; `null` before any. */
  message: string | null;
  /** Sources whose stored data came from a different Zotero, awaiting an answer. */
  pending: readonly ServerMismatch[];
  refresh: () => void;
  /** Adds the cited sources to `bibliography.json` after an insert (FR-CIT-05). */
  syncInserted: (citekeys: readonly string[]) => void;
  /** The person agreed to replace the first pending source. */
  confirm: () => void;
  /** The person kept the existing data for the first pending source. */
  decline: () => void;
};

/** What a component outside any provider sees: nothing cached and nothing to do. */
const INERT: SourcesModel = {
  views: [],
  items: [],
  lookup: () => null,
  busy: false,
  writable: false,
  message: null,
  pending: [],
  refresh: () => undefined,
  syncInserted: () => undefined,
  confirm: () => undefined,
  decline: () => undefined,
};

const SourcesContext = createContext<SourcesModel>(INERT);

export const useSources = (): SourcesModel => useContext(SourcesContext);

/** For the editor: call after a citation is inserted. */
export function useSourceSync(): (citekeys: readonly string[]) => void {
  return useSources().syncInserted;
}

function messageFor(outcome: SyncOutcome): string {
  switch (outcome.kind) {
    case "done":
      return syncSummary({
        added: outcome.added.length,
        updated: outcome.updated.length,
        missing: outcome.missing.length,
        unconfirmed: outcome.unconfirmed.length,
        failed: outcome.failed.length,
      });
    case "offline":
      return outcome.reason === "notRunning"
        ? sourcesMessages.offlineNotRunning
        : sourcesMessages.offlineDisabled;
    case "unreadable":
      return sourcesMessages.unreadable;
    case "notWritable":
      return sourcesMessages.notWritable;
    case "changed":
      return sourcesMessages.changed;
    case "failed":
      return sourcesMessages.failed;
  }
}

/** Reads `bibliography.json` for display; `null` when it is absent or unusable. */
async function readBibliography(
  api: SourcesApi,
  folder: FolderHandle,
): Promise<BibliographyFileModel | null> {
  try {
    const read = await api.readNotebookFile(folder, BIBLIOGRAPHY_PATH);
    if (read.status === "error" || read.data.kind === "missing") return null;
    const parsed = parseBibliography(read.data.text);
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

type ProviderProps = {
  folder: FolderHandle;
  writable: boolean;
  /** Overridable for tests; defaults to the real IPC commands. */
  api?: SourcesApi;
  now?: () => Date;
  children: ReactNode;
};

const systemNow = () => new Date();

/**
 * Holds the project's cached sources and runs inserts and refreshes against
 * `bibliography.json` (FR-CIT-05, FR-CIT-07). All file access goes through
 * the typed notebook commands; merging is `packages/format`.
 */
export function SourcesProvider({
  folder,
  writable,
  api = commands,
  now = systemNow,
  children,
}: ProviderProps) {
  const [file, setFile] = useState<BibliographyFileModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<readonly ServerMismatch[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void readBibliography(api, folder).then((read) => {
      if (alive.current) setFile(read);
    });
    return () => {
      alive.current = false;
    };
  }, [api, folder]);

  const run = useCallback(
    async (citekeys: readonly string[], confirmed: ReadonlySet<string>) => {
      setBusy(true);
      const outcome = await syncSources(
        { api, folder, now, confirmed },
        citekeys,
      );
      if (!alive.current) return;
      setBusy(false);
      setMessage(messageFor(outcome));
      if (outcome.kind === "done") {
        setFile(outcome.bibliography);
        setPending((current) => [...current, ...outcome.mismatches]);
      }
    },
    [api, folder, now],
  );

  const refresh = useCallback(() => {
    setPending([]);
    void run(
      (file ?? []).map((item) => item.id),
      new Set(),
    );
  }, [run, file]);

  const syncInserted = useCallback(
    (citekeys: readonly string[]) => void run(citekeys, new Set()),
    [run],
  );

  const confirm = useCallback(() => {
    const [first, ...rest] = pending;
    if (first === undefined) return;
    setPending(rest);
    void run([first.citekey], new Set([first.citekey]));
  }, [run, pending]);

  const decline = useCallback(() => setPending((list) => list.slice(1)), []);

  const model = useMemo<SourcesModel>(
    () => ({
      views: (file ?? []).map(sourceView),
      items: file ?? [],
      lookup: sourceLookup(file),
      busy,
      writable,
      message,
      pending,
      refresh,
      syncInserted,
      confirm,
      decline,
    }),
    [
      file,
      busy,
      writable,
      message,
      pending,
      refresh,
      syncInserted,
      confirm,
      decline,
    ],
  );

  return (
    <SourcesContext.Provider value={model}>{children}</SourcesContext.Provider>
  );
}
