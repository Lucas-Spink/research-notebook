import type {
  Arranged,
  ArrangedExperiment,
  LoadedExperiment,
  RecognisedSectionKey,
} from "@research-notebook/format";

/** Where a live section's editor is shown: in its table cell, or in the details panel below. */
export type Surface = "table" | "details";

/**
 * The one section being edited anywhere in the application (FR-EDT-03,
 * ADR-0043). An experiment is named by its folder, not its ID: two files
 * can share an ID, and only the first loaded may be edited (spec P6).
 */
export type LiveTarget = {
  folder: string;
  section: RecognisedSectionKey;
  surface: Surface;
};

/**
 * Identifies a live target's autosave; a new key starts a fresh one. The
 * surface is left out, so moving a section between the table and the
 * details panel keeps the same autosave.
 */
export function liveKey(target: LiveTarget | null): string {
  return target === null ? "" : `${target.folder}:${target.section}`;
}

/** Whether `target` is this experiment's section, shown on this surface. */
export function isLiveIn(
  target: LiveTarget | null,
  folder: string,
  section: RecognisedSectionKey,
  surface: Surface,
): boolean {
  return (
    target !== null &&
    target.folder === folder &&
    target.section === section &&
    target.surface === surface
  );
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
