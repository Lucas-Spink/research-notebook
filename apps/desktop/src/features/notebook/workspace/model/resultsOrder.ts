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
