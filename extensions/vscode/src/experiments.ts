import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseExperiment, parseQuestion } from "@research-notebook/format";

/** One experiment offered by the quick pick (FR-VSC-03): its id, ref and
 * title, plus its question's ref and title so the picker can show both. */
export interface ExperimentChoice {
  id: string;
  ref: string;
  title: string;
  questionRef: string;
  questionTitle: string;
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function listNames(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/**
 * Every experiment in the project at `projectRoot`, read through
 * `packages/format` (FR-VSC-03, AGENTS.md rule 2 — this module never parses
 * YAML or Markdown itself). A question or experiment file that fails to
 * parse is left out rather than thrown for: this only ever reads, and an
 * unreadable file is the desktop app's read-only concern (AGENTS.md rule
 * 5), not a reason to break the quick pick for every other experiment.
 */
export async function listExperiments(
  projectRoot: string,
): Promise<ExperimentChoice[]> {
  const questionsDir = join(projectRoot, "_notebook", "questions");
  const experimentsDir = join(projectRoot, "_notebook", "experiments");

  const questionTitles = new Map<string, { ref: string; title: string }>();
  for (const name of await listNames(questionsDir)) {
    if (!name.endsWith(".md")) continue;
    const text = await readText(join(questionsDir, name));
    if (text === undefined) continue;
    const parsed = parseQuestion(text);
    if (!parsed.ok) continue;
    questionTitles.set(parsed.value.frontmatter.id, {
      ref: parsed.value.frontmatter.ref,
      title: parsed.value.frontmatter.title,
    });
  }

  const choices: ExperimentChoice[] = [];
  for (const folder of await listNames(experimentsDir)) {
    const text = await readText(join(experimentsDir, folder, "experiment.md"));
    if (text === undefined) continue;
    const parsed = parseExperiment(text);
    if (!parsed.ok) continue;
    const { id, ref, title, question } = parsed.value.frontmatter;
    const questionInfo = questionTitles.get(question);
    choices.push({
      id,
      ref,
      title,
      questionRef: questionInfo?.ref ?? "?",
      questionTitle: questionInfo?.title ?? "Unassigned",
    });
  }

  choices.sort((a, b) => a.ref.localeCompare(b.ref));
  return choices;
}
