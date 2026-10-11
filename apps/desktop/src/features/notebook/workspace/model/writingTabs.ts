/** The part of an experiment the tabs need; the real `ArrangedExperiment` has it. */
type ExperimentLike = {
  experiment: {
    folder: string;
    file: { frontmatter: { ref: string; title: string } };
  };
  readOnly: boolean;
};

/** The part of the arranged notebook the tabs need. */
type ArrangedLike = {
  questions: {
    question: {
      fileName: string;
      file: { frontmatter: { ref: string; title: string } };
    };
    experiments: ExperimentLike[];
  }[];
  unassigned: ExperimentLike[];
};

/** The key of the tab for experiments that no question holds. */
export const UNASSIGNED_TAB = "unassigned";

export type ExperimentTab = {
  /** The experiment's folder, which names it everywhere the live editor does. */
  folder: string;
  label: string;
  readOnly: boolean;
};

export type QuestionTab = {
  /** The question file's name, or `UNASSIGNED_TAB`. */
  key: string;
  label: string;
  experiments: ExperimentTab[];
};

const experimentTab = (item: ExperimentLike): ExperimentTab => ({
  folder: item.experiment.folder,
  label: `${item.experiment.file.frontmatter.ref} ${item.experiment.file.frontmatter.title}`,
  readOnly: item.readOnly,
});

/**
 * The writing panel's tabs: a tab for each question in order, each holding
 * its experiments, and Unassigned last when some experiment has no question.
 */
export function tabsOf(arranged: ArrangedLike): QuestionTab[] {
  const tabs = arranged.questions.map((group): QuestionTab => ({
    key: group.question.fileName,
    label: `${group.question.file.frontmatter.ref} ${group.question.file.frontmatter.title}`,
    experiments: group.experiments.map(experimentTab),
  }));
  return arranged.unassigned.length === 0
    ? tabs
    : [
        ...tabs,
        {
          key: UNASSIGNED_TAB,
          label: "Unassigned",
          experiments: arranged.unassigned.map(experimentTab),
        },
      ];
}

/** Which question and experiment are showing, and the experiment last used in each question. */
export type WritingTabs = {
  question: string | null;
  experiment: string | null;
  last: Readonly<Record<string, string>>;
};

const firstExperiment = (tab: QuestionTab | undefined): string | null =>
  tab?.experiments[0]?.folder ?? null;

/** The first question and its first experiment, or nothing for an empty project. */
export function initialWriting(tabs: readonly QuestionTab[]): WritingTabs {
  const first = tabs[0];
  return {
    question: first?.key ?? null,
    experiment: firstExperiment(first),
    last: {},
  };
}

/**
 * Brings a choice up to date with the tabs as they now are, after a question
 * or experiment was added, moved or deleted. A choice that is still there is
 * returned as it was; one that is gone moves to another experiment of the same
 * question, else the first of the first question.
 */
export function reconcile(
  state: WritingTabs,
  tabs: readonly QuestionTab[],
): WritingTabs {
  const present = new Set(
    tabs.flatMap((t) => t.experiments.map((e) => e.folder)),
  );
  const last = Object.fromEntries(
    Object.entries(state.last).filter(([, folder]) => present.has(folder)),
  );
  const unchangedLast =
    Object.keys(last).length === Object.keys(state.last).length;
  const tab = tabs.find((t) => t.key === state.question);
  const stillHere =
    tab !== undefined &&
    (state.experiment === null
      ? tab.experiments.length === 0
      : tab.experiments.some((e) => e.folder === state.experiment));
  if (stillHere) return unchangedLast ? state : { ...state, last };
  if (tab !== undefined) {
    return { question: tab.key, experiment: firstExperiment(tab), last };
  }
  return { ...initialWriting(tabs), last };
}

/** Shows a question at the experiment last used in it, else its first. A question that is not there changes nothing. */
export function chooseQuestion(
  state: WritingTabs,
  key: string,
  tabs: readonly QuestionTab[],
): WritingTabs {
  const tab = tabs.find((t) => t.key === key);
  if (tab === undefined) return state;
  const remembered = state.last[key];
  const experiment = tab.experiments.some((e) => e.folder === remembered)
    ? (remembered ?? null)
    : firstExperiment(tab);
  return { ...state, question: key, experiment };
}

/** Shows an experiment under its own question, and remembers it there. An experiment that is not there changes nothing. */
export function chooseExperiment(
  state: WritingTabs,
  folder: string,
  tabs: readonly QuestionTab[],
): WritingTabs {
  const tab = tabs.find((t) => t.experiments.some((e) => e.folder === folder));
  if (tab === undefined) return state;
  return {
    question: tab.key,
    experiment: folder,
    last: { ...state.last, [tab.key]: folder },
  };
}
