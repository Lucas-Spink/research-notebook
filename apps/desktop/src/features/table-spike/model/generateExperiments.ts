/** A question, matching the header-row fields in spec 4.3 and FR-TBL-02. */
export interface Question {
  readonly id: string;
  readonly ref: string;
  readonly title: string;
  readonly motivation: string;
}

/** One experiment row, matching the table columns in spec 4.3. */
export interface ExperimentRow {
  readonly id: string;
  readonly questionId: string;
  readonly ref: string;
  readonly title: string;
  readonly status: "planned" | "in-progress" | "complete";
  readonly methods: string;
  readonly results: string;
  readonly resultsNotes: string;
  readonly interpretation: string;
  readonly literature: string;
  readonly resultThumbnailCount: number;
}

export interface GeneratedTable {
  readonly questions: readonly Question[];
  readonly experiments: readonly ExperimentRow[];
}

/**
 * Deterministic PRNG (mulberry32) so sample data is reproducible across runs
 * without relying on Math.random, per the project's determinism rule.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, options: readonly T[]): T {
  const index = Math.floor(random() * options.length);
  // options is a non-empty literal array at every call site below.
  return options[Math.min(index, options.length - 1)] as T;
}

function sentence(
  random: () => number,
  subjects: readonly string[],
  verbs: readonly string[],
  objects: readonly string[],
): string {
  return `${pick(random, subjects)} ${pick(random, verbs)} ${pick(random, objects)}.`;
}

const SUBJECTS = [
  "The assay",
  "This run",
  "The control group",
  "The treated sample",
  "The pilot batch",
  "The replicate set",
];
const VERBS = [
  "shows",
  "confirms",
  "questions",
  "narrows down",
  "rules out",
  "partially supports",
];
const OBJECTS = [
  "the expected dose-response curve",
  "a shift in baseline signal",
  "the hypothesised mechanism",
  "an artefact from sample prep",
  "the need for a longer incubation",
  "consistency with the pilot data",
];
const STATUSES: readonly ExperimentRow["status"][] = [
  "planned",
  "in-progress",
  "complete",
];
const QUESTION_TOPICS = [
  "temperature sensitivity",
  "dose-response scaling",
  "batch-to-batch variance",
  "reagent stability",
  "cross-reactivity",
  "signal-to-noise floor",
  "protocol reproducibility",
  "sample degradation",
  "assay linearity",
  "instrument drift",
];

function paragraph(random: () => number, sentenceCount: number): string {
  return Array.from({ length: sentenceCount }, () =>
    sentence(random, SUBJECTS, VERBS, OBJECTS),
  ).join(" ");
}

/**
 * Distributes `total` items across `groupCount` groups as evenly as possible,
 * independent of the random stream, so the experiment total is always exact.
 */
function evenSplit(total: number, groupCount: number): number[] {
  const base = Math.floor(total / groupCount);
  const remainder = total % groupCount;
  return Array.from(
    { length: groupCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

/**
 * Generates a deterministic sample project: `questionCount` questions whose
 * experiment counts sum to exactly `totalExperiments`, for the S1-T07 table
 * spike (spec 7.3, gate S1-G08).
 */
export function generateExperiments(
  random: () => number,
  totalExperiments = 500,
  questionCount = 20,
): GeneratedTable {
  const counts = evenSplit(totalExperiments, questionCount);
  const questions: Question[] = [];
  const experiments: ExperimentRow[] = [];

  for (let questionIndex = 0; questionIndex < questionCount; questionIndex++) {
    const questionRef = `Q${questionIndex + 1}`;
    const questionId = `question-${questionRef}`;
    const topic = QUESTION_TOPICS[questionIndex % QUESTION_TOPICS.length];
    questions.push({
      id: questionId,
      ref: questionRef,
      title: `How does ${topic} affect the result?`,
      motivation: paragraph(random, 2),
    });

    const experimentCount = counts[questionIndex] ?? 0;
    for (
      let experimentIndex = 0;
      experimentIndex < experimentCount;
      experimentIndex++
    ) {
      const experimentRef = `${questionRef}.${experimentIndex + 1}`;
      experiments.push({
        id: `experiment-${experimentRef}`,
        questionId,
        ref: experimentRef,
        title: `Trial ${experimentIndex + 1} on ${topic}`,
        status: pick(random, STATUSES),
        methods: paragraph(random, 2),
        results: paragraph(random, 2),
        resultsNotes: paragraph(random, 1),
        interpretation: paragraph(random, 2),
        literature: pick(random, [
          "Smith 2024; Obi 2023",
          "No sources cited",
          "Chen 2025",
        ]),
        resultThumbnailCount: Math.floor(random() * 6),
      });
    }
  }

  return { questions, experiments };
}
