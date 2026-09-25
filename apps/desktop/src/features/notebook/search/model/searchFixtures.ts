import type {
  Arranged,
  ArtefactModel,
  ArtefactsFileModel,
  LoadedExperiment,
  LoadedQuestion,
  RecognisedSectionKey,
} from "@research-notebook/format";

/** Plain fixtures for `searchIndex` tests and benchmarks: shapes only, not
 * schema-valid in every field (nothing here is parsed or serialised). */

let counter = 0;
function ulid(): string {
  counter += 1;
  return `01J${String(counter).padStart(23, "0")}`;
}

export function question(
  ref: string,
  title: string,
  motivation = "",
): LoadedQuestion {
  return {
    fileName: `${ref}.md`,
    file: {
      frontmatter: { id: ulid(), ref, title, created: "2026-09-21T10:00:00Z" },
      body: motivation,
    },
  };
}

export function experiment(
  folder: string,
  title: string,
  sections: Partial<Record<RecognisedSectionKey, string>> = {},
  questionId = ulid(),
): LoadedExperiment {
  const keys: RecognisedSectionKey[] = [
    "methods",
    "results_notes",
    "interpretation",
  ];
  return {
    folder,
    file: {
      frontmatter: {
        id: ulid(),
        ref: folder,
        question: questionId,
        title,
        status: "planned",
        created: "2026-09-21T10:00:00Z",
        updated: "2026-09-21T10:00:00Z",
      },
      body: {
        preamble: "",
        sections: keys.map((key) => ({ key, body: sections[key] ?? "" })),
        literature: null,
      },
    },
  };
}

export function artefact(name: string, path: string): ArtefactModel {
  return {
    id: ulid(),
    name,
    role: "result",
    type: "image",
    source: { root: "project", path },
    created: "2026-09-21T10:00:00Z",
    mode: "copy",
    versions: [
      {
        v: 1,
        file: `evidence/${name}.png`,
        sha256: "a".repeat(64),
        size: 1,
        captured: "2026-09-21T10:00:00Z",
      },
    ],
  };
}

export function artefactsFile(artefacts: ArtefactModel[]): ArtefactsFileModel {
  return { format_version: 1, artefacts, groups: [] };
}

/** One question holding one experiment, for the simplest coverage tests. */
export function oneQuestionOneExperiment(
  sections: Partial<Record<RecognisedSectionKey, string>> = {},
): { arranged: Arranged; experiment: LoadedExperiment } {
  const q = question(
    "Q-001",
    "Does caching change latency?",
    "Background on caching.",
  );
  const exp = experiment(
    "EXP-001",
    "Baseline run",
    sections,
    q.file.frontmatter.id,
  );
  const arranged: Arranged = {
    questions: [
      {
        question: q,
        readOnly: false,
        experiments: [
          { experiment: exp, readOnly: false, absentFromOrder: false },
        ],
      },
    ],
    unassigned: [],
    problems: [],
  };
  return { arranged, experiment: exp };
}

const METHODS_FILLER =
  "Samples were prepared in triplicate and processed on the standard pipeline with default parameters throughout.";
const RESULTS_FILLER =
  "The distribution of measured values was consistent across replicates with only minor batch variation observed.";
const INTERPRETATION_FILLER =
  "Taken together these observations are consistent with the working model proposed at the start of the project.";

/**
 * A project the size of the `large` fixture (S2-T13): 20 questions of 25
 * experiments each, 10 artefacts per experiment, for the S4-G06 benchmark.
 * One experiment in every question carries a distinctive word in each
 * recognised section, so a search can assert it finds every section type.
 */
export function largeProject(): {
  arranged: Arranged;
  artefactsByFolder: ReadonlyMap<string, ArtefactsFileModel>;
} {
  const QUESTIONS = 20;
  const EXPERIMENTS_PER_QUESTION = 25;
  const ARTEFACTS_PER_EXPERIMENT = 10;

  const questions: Arranged["questions"] = [];
  const artefactsByFolder = new Map<string, ArtefactsFileModel>();

  for (let q = 1; q <= QUESTIONS; q += 1) {
    const qRef = `Q-${String(q).padStart(3, "0")}`;
    const loadedQuestion = question(
      qRef,
      `Question ${q} motivation topic`,
      "Ordinary motivation text.",
    );
    const experiments = [];
    for (let e = 1; e <= EXPERIMENTS_PER_QUESTION; e += 1) {
      const folder = `EXP-${String((q - 1) * EXPERIMENTS_PER_QUESTION + e).padStart(4, "0")}`;
      const marked = e === 1;
      const loadedExperiment = experiment(
        folder,
        `Trial ${folder}`,
        {
          methods: marked
            ? `${METHODS_FILLER} A xenonflux catalyst was used this time.`
            : METHODS_FILLER,
          results_notes: marked
            ? `${RESULTS_FILLER} A xenonflux signature appeared in the trace.`
            : RESULTS_FILLER,
          interpretation: marked
            ? `${INTERPRETATION_FILLER} The xenonflux effect explains the shift.`
            : INTERPRETATION_FILLER,
        },
        loadedQuestion.file.frontmatter.id,
      );
      experiments.push({
        experiment: loadedExperiment,
        readOnly: false,
        absentFromOrder: false,
      });
      const artefacts = Array.from(
        { length: ARTEFACTS_PER_EXPERIMENT },
        (_unused, index) =>
          artefact(
            `Figure ${index + 1}`,
            `out/${folder}/figure-${index + 1}.png`,
          ),
      );
      artefactsByFolder.set(folder, artefactsFile(artefacts));
    }
    questions.push({ question: loadedQuestion, readOnly: false, experiments });
  }

  return {
    arranged: { questions, unassigned: [], problems: [] },
    artefactsByFolder,
  };
}
