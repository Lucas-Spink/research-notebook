import type {
  Arranged,
  ArrangedExperiment,
  LoadedExperiment,
  RecognisedSectionKey,
} from "@research-notebook/format";

/**
 * The one section being edited anywhere in the application (FR-EDT-03,
 * ADR-0043). An experiment is named by its folder, not its ID: two files
 * can share an ID, and only the first loaded may be edited (spec P6).
 */
export type LiveTarget = { folder: string; section: RecognisedSectionKey };

/** Identifies a live target's autosave; a new key starts a fresh one. */
export function liveKey(target: LiveTarget | null): string {
  return target === null ? "" : `${target.folder}:${target.section}`;
}

/**
 * The experiment in `folder` if it may be edited: shown under a question or
 * unassigned, and not read-only (spec P6; AGENTS.md rule 5).
 */
export function editableExperiment(
  arranged: Arranged | null,
  folder: string,
): ArrangedExperiment | undefined {
  if (arranged === null) return undefined;
  const items = [
    ...arranged.questions.flatMap((q) => q.experiments),
    ...arranged.unassigned,
  ];
  return items.find((i) => i.experiment.folder === folder && !i.readOnly);
}

/** A section's text as stored, or an empty string when the file has none. */
export function sectionText(
  experiment: LoadedExperiment,
  key: RecognisedSectionKey,
): string {
  return experiment.file.body.sections.find((s) => s.key === key)?.body ?? "";
}
