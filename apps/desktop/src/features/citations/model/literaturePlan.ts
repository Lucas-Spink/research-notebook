import {
  citationContext,
  setExperimentSection,
  type BibliographyItemModel,
  type ExperimentBodyModel,
  type RecognisedSectionKey,
} from "@research-notebook/format";
import type {
  LiteratureInput,
  LiteratureResult,
} from "@research-notebook/citations";

/** Renders the Literature block's content; the citeproc worker in the app, a direct call in tests. */
export type LiteratureRenderer = (
  input: LiteratureInput,
) => Promise<LiteratureResult>;

/** Everything a render needs besides the experiment: all read from files (FR-CIT-06). */
export type LiteratureSetup = {
  render: LiteratureRenderer;
  /** `bibliography.json`, whatever each source's status. */
  items: readonly BibliographyItemModel[];
  styleXml: string;
  localeXml: string;
};

/**
 * What to do with the Literature block when a section is saved.
 * - `write`: replace it with `literature`, which was computed from the
 *   citations identified by `basis`.
 * - `edited`: the stored block is not what the app would have generated for
 *   the stored text, so a person changed it (spec 5.5 rule 6); replacing it
 *   needs their say-so. `literature` is what would replace it.
 * - `none`: nothing could be rendered; the block stays as it is and the
 *   section is still saved.
 */
export type BlockPlan =
  | { kind: "write"; literature: string; basis: string }
  | { kind: "edited"; literature: string; basis: string }
  | { kind: "none" };

/** Identifies the citation context a block was computed from, so a save can tell it is still current. */
export function citationBasis(body: ExperimentBodyModel): string {
  return JSON.stringify(citationContext(body));
}

async function renderBody(
  setup: LiteratureSetup,
  body: ExperimentBodyModel,
): Promise<string | null> {
  try {
    const result = await setup.render({
      clusters: citationContext(body),
      items: setup.items,
      styleXml: setup.styleXml,
      localeXml: setup.localeXml,
    });
    return result.ok ? result.value.text : null;
  } catch {
    return null;
  }
}

/**
 * Decides the Literature block for saving `text` as `key` of the experiment
 * whose stored body is `stored` (FR-CIT-09, FR-CIT-10). Regenerates from the
 * text as it will be stored, and compares the stored block with a fresh
 * regeneration of the stored text, which is deterministic and needs no
 * format change (format-v1.md, open question 1, option a): a difference means
 * the block was edited by hand. Never throws and never changes `stored`.
 */
export async function planLiterature(
  setup: LiteratureSetup,
  stored: ExperimentBodyModel,
  key: RecognisedSectionKey,
  text: string,
): Promise<BlockPlan> {
  const next = setExperimentSection(stored, key, text);
  return next.ok ? planBlock(setup, stored, next.value) : { kind: "none" };
}

/**
 * The block for `stored` unchanged but rendered afresh, for a change that
 * touches no text: a new citation style (FR-CIT-10), or a refreshed source.
 * `setup` holds the new style; the stored block is compared with a render of
 * the same text under that style, so a style change alone reads as `edited`
 * unless `previous` (the setup the block was generated under) is given.
 */
export async function planRegeneration(
  setup: LiteratureSetup,
  stored: ExperimentBodyModel,
  previous: LiteratureSetup = setup,
): Promise<BlockPlan> {
  return planBlock(setup, stored, stored, previous);
}

async function planBlock(
  setup: LiteratureSetup,
  stored: ExperimentBodyModel,
  next: ExperimentBodyModel,
  generatedUnder: LiteratureSetup = setup,
): Promise<BlockPlan> {
  const literature = await renderBody(setup, next);
  if (literature === null) return { kind: "none" };
  const basis = citationBasis(next);

  if (stored.literature === null) return { kind: "write", literature, basis };
  const previous = await renderBody(generatedUnder, stored);
  if (previous !== null && previous !== stored.literature) {
    return { kind: "edited", literature, basis };
  }
  return { kind: "write", literature, basis };
}

const MEMORY = 4;

/**
 * Remembers the last few renders by their whole input, so the comparison a
 * save makes against the stored text is free when the previous save just
 * produced it. Only results are kept; a rejection is not cached.
 */
export function memoiseRenderer(
  render: LiteratureRenderer,
): LiteratureRenderer {
  const remembered = new Map<string, LiteratureResult>();
  return async (input) => {
    const key = JSON.stringify(input);
    const hit = remembered.get(key);
    if (hit !== undefined) return hit;
    const result = await render(input);
    remembered.set(key, result);
    if (remembered.size > MEMORY) {
      const oldest = remembered.keys().next().value;
      if (oldest !== undefined) remembered.delete(oldest);
    }
    return result;
  };
}
