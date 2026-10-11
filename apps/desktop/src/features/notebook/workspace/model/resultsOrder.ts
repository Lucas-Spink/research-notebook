/** The key of the group for experiments that no question holds. */
const UNASSIGNED_KEY = "unassigned";

/** `groups` with the one named `current` first and the others in their order. */
export function currentFirst<T extends { key: string }>(
  groups: readonly T[],
  current: string | null,
): T[] {
  const here = groups.find((group) => group.key === current);
  return here === undefined
    ? [...groups]
    : [here, ...groups.filter((group) => group !== here)];
}

type ArrangedLike = {
  questions: {
    question: { fileName: string };
    experiments: { experiment: { folder: string } }[];
  }[];
  unassigned: { experiment: { folder: string } }[];
};

/** What the table has selected, as far as finding its question needs. */
export type SelectionLike =
  | { kind: "question"; fileName: string }
  | { kind: "experiment"; folder: string }
  | null;

/** What a table row key selects (`question:<file>` or `experiment:<folder>`), or `null` for no key or one that is neither. */
export function selectionOfKey(key: string | null): SelectionLike {
  if (key === null) return null;
  if (key.startsWith("question:")) {
    return { kind: "question", fileName: key.slice("question:".length) };
  }
  if (key.startsWith("experiment:")) {
    return { kind: "experiment", folder: key.slice("experiment:".length) };
  }
  return null;
}

/** The group the selection belongs to: its question's file name, `unassigned`, or `null`. */
export function questionKeyOf(
  arranged: ArrangedLike,
  selection: SelectionLike,
): string | null {
  if (selection === null) return null;
  if (selection.kind === "question") return selection.fileName;
  const holder = arranged.questions.find((group) =>
    group.experiments.some((e) => e.experiment.folder === selection.folder),
  );
  if (holder !== undefined) return holder.question.fileName;
  return arranged.unassigned.some(
    (e) => e.experiment.folder === selection.folder,
  )
    ? UNASSIGNED_KEY
    : null;
}
