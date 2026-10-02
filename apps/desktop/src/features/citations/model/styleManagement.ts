import {
  BUNDLED_STYLES,
  EN_US_LOCALE,
  styleFileName,
  validateStyle,
  type StyleProblem,
} from "@research-notebook/citations";
import type {
  BibliographyItemModel,
  CitationStyleChange,
  NotebookState,
} from "@research-notebook/format";
import type { FolderHandle } from "../../../ipc/bindings";
import {
  planRegeneration,
  type LiteratureRenderer,
  type LiteratureSetup,
} from "./literaturePlan";
import { loadStyle, type StyleApi } from "./styleSource";

/** A style the person picked: one the app ships, or a `.csl` file they chose. */
export type StyleChoice =
  | { kind: "bundled"; file: string }
  | { kind: "imported"; fileName: string; text: string };

export type StyleOutcome =
  /** Saved. `keptEdited` blocks were left alone because someone edited them by hand. */
  | { kind: "changed"; keptEdited: number }
  /** Nothing was written: the style is not usable, or its name is taken by a different file. */
  | { kind: "refused"; problem: StyleProblem | { kind: "nameTaken" } }
  /** Nothing was written, or the save failed; the project is read-only or the disk said no. */
  | { kind: "failed" };

export type StyleEnv = {
  api: StyleApi;
  folder: FolderHandle;
  /** The project as loaded; never changed here. */
  state: NotebookState;
  /** `bibliography.json`, whatever each source's status. */
  items: readonly BibliographyItemModel[];
  render: LiteratureRenderer;
  /** Saves the change as one plan and resolves whether it was saved. */
  apply: (change: CitationStyleChange) => Promise<boolean>;
};

type Resolved = { file: string; xml: string };

function resolve(
  choice: StyleChoice,
): Resolved | Extract<StyleOutcome, { kind: "refused" }> {
  if (choice.kind === "bundled") {
    const found = BUNDLED_STYLES.find((s) => s.file === choice.file);
    if (found === undefined) {
      return { kind: "refused", problem: { kind: "notCsl" } };
    }
    return { file: found.file, xml: found.xml };
  }
  const checked = validateStyle(choice.text);
  if (!checked.ok) return { kind: "refused", problem: checked.error };
  return { file: styleFileName(choice.fileName), xml: checked.value.xml };
}

/** What `styles/<file>` holds: its text, `null` if absent, `undefined` if that could not be told. */
async function stored(
  env: StyleEnv,
  file: string,
): Promise<string | null | undefined> {
  try {
    const read = await env.api.readNotebookFile(
      env.folder,
      `_notebook/styles/${file}`,
    );
    if (read.status === "error") return undefined;
    return read.data.kind === "text" ? read.data.text : null;
  } catch {
    return undefined;
  }
}

/** Each experiment's block under `next`, leaving out blocks someone edited by hand. */
async function regenerate(
  env: StyleEnv,
  next: LiteratureSetup,
): Promise<{ literature: Record<string, string>; keptEdited: number }> {
  const current = await loadStyle(
    env.api,
    env.folder,
    env.state.project.citation_style,
  );
  const before: LiteratureSetup = { ...next, ...current };
  const literature: Record<string, string> = {};
  let keptEdited = 0;
  for (const { file } of env.state.experiments) {
    try {
      const plan = await planRegeneration(next, file.body, before);
      if (plan.kind === "write") {
        literature[file.frontmatter.id] = plan.literature;
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
 * Makes `choice` the project's citation style (FR-CIT-11): checks it, copies
 * it into `styles/` unless an identical file is already there, and
 * regenerates each experiment's Literature in the same plan (FR-CIT-10). A
 * file of the same name with different content is never overwritten, and a
 * `styles/` that cannot be read changes nothing. Never throws.
 */
export async function chooseStyle(
  env: StyleEnv,
  choice: StyleChoice,
): Promise<StyleOutcome> {
  const resolved = resolve(choice);
  if ("kind" in resolved) return resolved;
  const { file, xml } = resolved;

  const existing = await stored(env, file);
  if (existing === undefined) return { kind: "failed" };
  const same = existing !== null && validateStyle(existing).ok;
  if (existing !== null && (!same || normalised(existing) !== xml)) {
    return { kind: "refused", problem: { kind: "nameTaken" } };
  }

  try {
    const { literature, keptEdited } = await regenerate(env, {
      render: env.render,
      items: env.items,
      styleXml: xml,
      localeXml: EN_US_LOCALE,
    });
    const saved = await env.apply({
      file,
      ...(existing === null ? { copy: xml } : {}),
      literature,
    });
    return saved ? { kind: "changed", keptEdited } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

function normalised(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}
