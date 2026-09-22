import {
  refNumber,
  summariseMarkdown,
  type Arranged,
  type ArrangedExperiment,
  type ArrangedQuestion,
  type ExperimentStatus,
  type ExperimentFile,
  type LoadedExperiment,
} from "@research-notebook/format";

/** The collapse key of the Unassigned group, which has no ID to store in project.yaml. */
export const UNASSIGNED_KEY = "unassigned";

export type SortColumn = "ref" | "title" | "status" | "started" | "completed";
/** `null` is the order in project.yaml. Sorting never leaves a question. */
export type SortState = {
  column: SortColumn;
  direction: "asc" | "desc";
} | null;
export type FilterState = { text: string; status: ExperimentStatus | "all" };

/** Plain, bounded summaries of an experiment's sections, one per cell (FR-TBL-05). */
export type Summaries = {
  methods: string;
  results_notes: string;
  interpretation: string;
  literature: string;
};

/** A question's full-width header row (FR-TBL-02), or the Unassigned one. */
export type HeaderRow = {
  kind: "header";
  key: string;
  /** `null` for Unassigned. */
  questionId: string | null;
  ref: string | null;
  title: string;
  motivation: string;
  /** How many experiments pass the filter, and how many there are (FR-TBL-03). */
  shown: number;
  total: number;
  /** A filter is in force, so the header says "n of m". */
  filtered: boolean;
  collapsed: boolean;
  readOnly: boolean;
};

export type ExperimentRow = {
  kind: "experiment";
  key: string;
  questionId: string | null;
  item: ArrangedExperiment;
  summaries: Summaries;
};

/** Shown under an open question whose experiments the filter hid. */
export type EmptyRow = { kind: "empty"; key: string };

export type TableRow = HeaderRow | ExperimentRow | EmptyRow;

export type RowOptions = {
  /** Question IDs, and `UNASSIGNED_KEY`, whose experiments are hidden. */
  collapsed: ReadonlySet<string>;
  sort: SortState;
  filter: FilterState;
};

// A summary is made once per experiment file and reused until it is replaced.
const summaryCache = new WeakMap<ExperimentFile, Summaries>();
const haystackCache = new WeakMap<ExperimentFile, string>();

function section(
  file: ExperimentFile,
  key: "methods" | "results_notes" | "interpretation",
): string {
  return file.body.sections.find((s) => s.key === key)?.body ?? "";
}

function summariesOf(file: ExperimentFile): Summaries {
  const cached = summaryCache.get(file);
  if (cached !== undefined) return cached;
  const made: Summaries = {
    methods: summariseMarkdown(section(file, "methods")),
    results_notes: summariseMarkdown(section(file, "results_notes")),
    interpretation: summariseMarkdown(section(file, "interpretation")),
    literature: summariseMarkdown(file.body.literature ?? ""),
  };
  summaryCache.set(file, made);
  return made;
}

/** Everything a text filter looks at, in lower case, from the whole sections and not their summaries. */
function haystackOf(file: ExperimentFile): string {
  const cached = haystackCache.get(file);
  if (cached !== undefined) return cached;
  const front = file.frontmatter;
  const made = [
    front.ref,
    front.title,
    front.status,
    section(file, "methods"),
    section(file, "results_notes"),
    section(file, "interpretation"),
    file.body.literature ?? "",
  ]
    .join("\n")
    .toLowerCase();
  haystackCache.set(file, made);
  return made;
}

const STATUS_ORDER: Record<ExperimentStatus, number> = {
  planned: 0,
  running: 1,
  complete: 2,
  abandoned: 3,
};

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function ascending(
  column: SortColumn,
  a: LoadedExperiment,
  b: LoadedExperiment,
): number {
  const x = a.file.frontmatter;
  const y = b.file.frontmatter;
  switch (column) {
    case "ref": {
      const left = refNumber(x.ref);
      const right = refNumber(y.ref);
      if (left !== null && right !== null && left !== right) {
        return left - right;
      }
      return collator.compare(x.ref, y.ref);
    }
    case "title":
      return collator.compare(x.title, y.title);
    case "status":
      return STATUS_ORDER[x.status] - STATUS_ORDER[y.status];
    case "started":
    case "completed": {
      const left = x[column] ?? "";
      const right = y[column] ?? "";
      return left < right ? -1 : left > right ? 1 : 0;
    }
  }
}

/** Sorts a copy of `items`; equal values keep the order they had, and a missing date is always last. */
function sorted(
  items: readonly ArrangedExperiment[],
  sort: SortState,
): ArrangedExperiment[] {
  if (sort === null) return [...items];
  const sign = sort.direction === "asc" ? 1 : -1;
  const dateColumn =
    sort.column === "started" || sort.column === "completed"
      ? sort.column
      : null;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (dateColumn !== null) {
        const missingA =
          a.item.experiment.file.frontmatter[dateColumn] === undefined;
        const missingB =
          b.item.experiment.file.frontmatter[dateColumn] === undefined;
        if (missingA !== missingB) return missingA ? 1 : -1;
      }
      const order = ascending(
        sort.column,
        a.item.experiment,
        b.item.experiment,
      );
      return order !== 0 ? sign * order : a.index - b.index;
    })
    .map(({ item }) => item);
}

function matches(item: ArrangedExperiment, filter: FilterState): boolean {
  const file = item.experiment.file;
  if (filter.status !== "all" && file.frontmatter.status !== filter.status) {
    return false;
  }
  const text = filter.text.trim().toLowerCase();
  return text === "" || haystackOf(file).includes(text);
}

function group(
  key: string,
  head: Pick<
    HeaderRow,
    "questionId" | "ref" | "title" | "motivation" | "readOnly"
  >,
  items: readonly ArrangedExperiment[],
  options: RowOptions,
): TableRow[] {
  const filterOn =
    options.filter.text.trim() !== "" || options.filter.status !== "all";
  const shown = items.filter((item) => matches(item, options.filter));
  const collapsed = options.collapsed.has(head.questionId ?? UNASSIGNED_KEY);
  const rows: TableRow[] = [
    {
      kind: "header",
      key,
      ...head,
      shown: shown.length,
      total: items.length,
      filtered: filterOn,
      collapsed,
    },
  ];
  if (collapsed) return rows;
  for (const item of sorted(shown, options.sort)) {
    rows.push({
      kind: "experiment",
      key: `experiment:${item.experiment.folder}`,
      questionId: head.questionId,
      item,
      summaries: summariesOf(item.experiment.file),
    });
  }
  if (shown.length === 0 && items.length > 0) {
    rows.push({ kind: "empty", key: `empty:${key}` });
  }
  return rows;
}

function questionHead(q: ArrangedQuestion) {
  const front = q.question.file.frontmatter;
  return {
    questionId: front.id,
    ref: front.ref,
    title: front.title,
    motivation: summariseMarkdown(q.question.file.body),
    readOnly: q.readOnly,
  };
}

/**
 * The one flat list of rows the table shows, for virtualising: each question
 * header followed by its experiments (FR-TBL-01, FR-TBL-02), then Unassigned.
 * Filtering and sorting are done inside each question, so an experiment never
 * leaves its question and a header's count is its own (FR-TBL-03).
 */
export function buildRows(arranged: Arranged, options: RowOptions): TableRow[] {
  const rows: TableRow[] = [];
  for (const q of arranged.questions) {
    rows.push(
      ...group(
        `question:${q.question.fileName}`,
        questionHead(q),
        q.experiments,
        options,
      ),
    );
  }
  if (arranged.unassigned.length > 0) {
    rows.push(
      ...group(
        UNASSIGNED_KEY,
        {
          questionId: null,
          ref: null,
          title: "",
          motivation: "",
          readOnly: false,
        },
        arranged.unassigned,
        options,
      ),
    );
  }
  return rows;
}
