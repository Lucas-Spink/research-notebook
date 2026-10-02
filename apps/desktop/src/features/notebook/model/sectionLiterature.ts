import {
  citationContext,
  setExperimentSection,
  type NotebookState,
  type RecognisedSectionKey,
  type SectionEditOptions,
} from "@research-notebook/format";
import type { LiteratureChoice, LiteraturePlanner } from "../../citations";

function storedBody(state: NotebookState | null, id: string) {
  return state?.experiments.find((e) => e.file.frontmatter.id === id)?.file
    .body;
}

/**
 * The Literature block to save with a section's new text (FR-CIT-10), or
 * `null` to leave the block as it is. Never throws: a planner that fails
 * must not stop the person's text being saved.
 */
export async function chooseBlock(
  state: NotebookState | null,
  id: string,
  key: RecognisedSectionKey,
  text: string,
  planner: LiteraturePlanner | undefined,
): Promise<LiteratureChoice> {
  const stored = storedBody(state, id);
  if (planner === undefined || stored === undefined) return null;
  try {
    return await planner(stored, key, text);
  } catch {
    return null;
  }
}

/**
 * What to save beside the text, checked against the state the save really
 * runs on: the block was computed a moment earlier, and is dropped (the next
 * save regenerates it) if the citations it came from are no longer the ones
 * that will be stored.
 */
export function literatureOptions(
  state: NotebookState,
  id: string,
  key: RecognisedSectionKey,
  text: string,
  choice: LiteratureChoice,
): SectionEditOptions {
  const stored = storedBody(state, id);
  if (choice === null || stored === undefined) return {};
  const next = setExperimentSection(stored, key, text);
  if (!next.ok) return {};
  const current = JSON.stringify(citationContext(next.value));
  return current === choice.basis ? { literature: choice.literature } : {};
}
