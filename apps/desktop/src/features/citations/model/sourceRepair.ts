import {
  replaceSource,
  type BibliographyFileModel,
  type NotebookState,
  type SourceReplacement,
} from "@research-notebook/format";
import type { FolderHandle } from "../../../ipc/bindings";
import {
  planAfterTextChange,
  type LiteratureRenderer,
  type LiteratureSetup,
} from "./literaturePlan";
import { loadStyle, type StyleApi } from "./styleSource";
import { syncSources, type SourcesApi } from "./syncSources";

export type RepairOutcome =
  /** Saved. `keptEdited` blocks were left as they were because someone edited them by hand. */
  | {
      kind: "replaced";
      experiments: number;
      keptEdited: number;
      bibliography: BibliographyFileModel;
    }
  /** Only a missing or trashed source can be replaced, and not by itself. */
  | { kind: "notRepairable" }
  /** No experiment cites the source, so there is nothing to change. */
  | { kind: "notCited" }
  /** The chosen item is not in Zotero, is in its trash, or differs from what is held. */
  | { kind: "notUsable" }
  | { kind: "offline"; reason: "notRunning" | "disabled" }
  | { kind: "unreadable" | "notWritable" | "changed" | "failed" };

export type RepairEnv = {
  api: SourcesApi & StyleApi;
  folder: FolderHandle;
  now: () => Date;
  /** The project as loaded; never changed here. */
  state: NotebookState;
  /** `bibliography.json` as held, whatever each source's status. */
  items: BibliographyFileModel;
  render: LiteratureRenderer;
  /** Saves the replacement as one plan and resolves whether it was saved. */
  apply: (change: SourceReplacement) => Promise<boolean>;
};

/** The experiments whose text the replacement changes. */
function changedExperiments(
  state: NotebookState,
  change: SourceReplacement,
  now: () => Date,
) {
  const planned = replaceSource(state, change, {
    now,
    newId: () => "",
    appVersion: state.project.last_written_by,
  });
  if (!planned.ok) return null;
  const changed = state.experiments.flatMap((before, index) => {
    const after = planned.value.next.experiments[index];
    return after === undefined || after === before ? [] : [{ before, after }];
  });
  return changed;
}

/** Each changed experiment's block for the new text and bibliography, leaving out blocks edited by hand. */
async function blocks(
  env: RepairEnv,
  changed: NonNullable<ReturnType<typeof changedExperiments>>,
  items: BibliographyFileModel,
): Promise<{ literature: Record<string, string>; keptEdited: number }> {
  const style = await loadStyle(
    env.api,
    env.folder,
    env.state.project.citation_style,
  );
  const after: LiteratureSetup = { render: env.render, items, ...style };
  const before: LiteratureSetup = { ...after, items: env.items };
  const literature: Record<string, string> = {};
  let keptEdited = 0;
  for (const { before: was, after: now } of changed) {
    try {
      const plan = await planAfterTextChange(
        after,
        was.file.body,
        now.file.body,
        before,
      );
      if (plan.kind === "write") {
        literature[was.file.frontmatter.id] = plan.literature;
      } else if (plan.kind === "edited") {
        keptEdited += 1;
      }
    } catch {
      // A render that failed leaves that block as it was.
    }
  }
  return { literature, keptEdited };
}

/**
 * Replaces the missing or trashed source `from` with the item `to`
 * (FR-CIT-08): fetches the new item into `bibliography.json` (the old entry
 * stays, spec 5.9), then rewrites the citekey in every experiment that cites
 * the old one, with each Literature block regenerated in the same plan
 * (FR-CIT-10). Nothing is written unless some experiment cites `from`, and
 * the text is not touched unless the new source is in Zotero, not trashed and
 * in `bibliography.json`. A block someone edited by hand is kept. Never throws.
 */
export async function repairSource(
  env: RepairEnv,
  from: string,
  to: string,
): Promise<RepairOutcome> {
  try {
    const held = env.items.find((item) => item.id === from);
    if (held === undefined || held._zotero.status === "ok" || from === to) {
      return { kind: "notRepairable" };
    }
    const changed = changedExperiments(env.state, { from, to }, env.now);
    if (changed === null) return { kind: "notRepairable" };
    if (changed.length === 0) return { kind: "notCited" };

    const synced = await syncSources(
      { api: env.api, folder: env.folder, now: env.now },
      [to],
    );
    if (synced.kind === "offline") return synced;
    if (synced.kind !== "done") return { kind: synced.kind };
    const added = synced.bibliography.find((item) => item.id === to);
    if (added === undefined || added._zotero.status !== "ok") {
      return { kind: "notUsable" };
    }
    if (synced.mismatches.length + synced.unconfirmed.length > 0) {
      return { kind: "notUsable" };
    }

    const { literature, keptEdited } = await blocks(
      env,
      changed,
      synced.bibliography,
    );
    const saved = await env.apply({ from, to, literature });
    return saved
      ? {
          kind: "replaced",
          experiments: changed.length,
          keptEdited,
          bibliography: synced.bibliography,
        }
      : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
