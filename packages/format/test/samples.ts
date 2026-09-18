/**
 * Valid sample values for every notebook file, taken from spec Appendix A
 * and 5.3/5.10 with the ULIDs corrected to strict Crockford Base32 (S2-T01)
 * and abbreviated checksums expanded to real lengths. Tests derive invalid
 * variants from these with `setIn` and `removeIn`, which never mutate.
 */

export const PROJECT_ID = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";
export const QUESTION_ID = "01JAXA1C5D8E2F4G6H7J9K0M1N";
export const EXPERIMENT_ID = "01JAXQ8M3K7T2V9R4W6Y5Z0B1C";
export const EXPERIMENT_ID_2 = "01JAXQ9P2M6S1T8X3Z5A7C9E0G";
export const ARTEFACT_SCRIPT = "01JAXR2B4C6D8E0F2G4H6J8K0M";
export const ARTEFACT_TREATMENT = "01JAXR5D8K2M4N6P8Q0R2S4T6V";
export const ARTEFACT_BATCH = "01JAXR6E1F3G5H7J9K1M3N5P7Q";
export const ARTEFACT_RAW = "01JAXR9Q1W3E5R7T9Y1V3J5N7P";
export const GROUP_FIGURES = "01JAXS0A2B4C6D8E0F2G4H6J8K";
export const GROUP_QC = "01JAXS1B3C5D7E9F1G3H5J7K9M";
export const REQUEST_ID = "01JAXT0C4D6E8F0G2H4J6K8M0N";

export function hex64(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

export const COMMIT = "3f9c1e2d3f9c1e2d3f9c1e2d3f9c1e2d3f9c1e2d";

export const projectSample: Record<string, unknown> = {
  format_version: 1,
  id: PROJECT_ID,
  name: "Batch effects in treated organoids",
  created: "2026-09-01T09:12:44Z",
  last_written_by: "0.1.0",
  archived: null,
  locale: "en-GB",
  citation_style: "nature.csl",
  capture: { copy_threshold_mb: 100, evidence_in_git: false },
  numbering: { next_question: 4, next_experiment: 43 },
  order: [
    { question: QUESTION_ID, experiments: [EXPERIMENT_ID, EXPERIMENT_ID_2] },
  ],
  table: {
    columns: [
      { key: "motivation", width: 220, hidden: false },
      { key: "methods", width: 260, hidden: false },
      { key: "results", width: 280, hidden: false },
      { key: "results_notes", width: 300, hidden: false },
      { key: "interpretation", width: 320, hidden: false },
      { key: "literature", width: 240, hidden: false },
    ],
    collapsed_questions: [],
  },
  external_roots: [],
};

export const questionSample: Record<string, unknown> = {
  id: QUESTION_ID,
  ref: "Q-003",
  title: "Do batch effects explain the treatment signal?",
  created: "2026-09-01T09:30:00Z",
};

export const experimentSample: Record<string, unknown> = {
  id: EXPERIMENT_ID,
  ref: "EXP-042",
  question: QUESTION_ID,
  title: "PCA of treatment and batch",
  status: "complete",
  started: "2026-09-02",
  completed: "2026-09-05",
  created: "2026-09-02T08:30:00Z",
  updated: "2026-09-05T16:11:42Z",
};

export const artefactsSample: Record<string, unknown> = {
  format_version: 1,
  artefacts: [
    {
      id: ARTEFACT_SCRIPT,
      name: "PCA script",
      role: "method",
      mode: "copy",
      type: "script",
      source: { root: "project", path: "scripts/02_pca.R" },
      created: "2026-09-03T13:58:02Z",
      versions: [
        {
          v: 1,
          file: "methods/02_pca.R",
          sha256: hex64("5c0e"),
          size: 4121,
          captured: "2026-09-03T13:58:02Z",
          provenance: {
            repo: ".",
            commit: COMMIT,
            path_in_repo: "scripts/02_pca.R",
            file_dirty: false,
            tree_dirty: true,
          },
        },
      ],
    },
    {
      id: ARTEFACT_TREATMENT,
      name: "PCA by treatment",
      role: "result",
      mode: "copy",
      type: "pdf",
      source: { root: "project", path: "results/pca/pca_by_treatment.pdf" },
      created: "2026-09-03T14:02:11Z",
      versions: [
        {
          v: 1,
          file: "evidence/pca_by_treatment.pdf",
          sha256: hex64("9b1c"),
          size: 88213,
          captured: "2026-09-03T14:02:11Z",
        },
        {
          v: 2,
          file: "evidence/pca_by_treatment.v2.pdf",
          sha256: hex64("4e7a"),
          size: 90411,
          captured: "2026-09-05T09:40:52Z",
        },
      ],
    },
    {
      id: ARTEFACT_BATCH,
      name: "PCA by batch",
      role: "result",
      mode: "copy",
      type: "pdf",
      source: { root: "project", path: "results/pca/pca_by_batch.pdf" },
      created: "2026-09-03T14:05:30Z",
      versions: [
        {
          v: 1,
          file: "evidence/pca_by_batch.pdf",
          sha256: hex64("a3d5"),
          size: 79002,
          captured: "2026-09-03T14:05:30Z",
        },
      ],
    },
    {
      id: ARTEFACT_RAW,
      name: "Raw counts",
      role: "result",
      mode: "link",
      type: "other",
      source: { root: "project", path: "data/counts.h5" },
      created: "2026-09-02T10:00:00Z",
      link: {
        sha256: hex64("c21f"),
        size: 18400000000,
        observed_mtime: "2026-08-30T22:14:09Z",
        checked: "2026-09-05T16:00:00Z",
      },
    },
  ],
  groups: [
    {
      id: GROUP_FIGURES,
      name: "Figures",
      items: [ARTEFACT_TREATMENT, ARTEFACT_BATCH],
      groups: [
        { id: GROUP_QC, name: "QC", items: [ARTEFACT_BATCH], groups: [] },
      ],
    },
  ],
};

export const requestCopySample: Record<string, unknown> = {
  format_version: 1,
  request_id: REQUEST_ID,
  created: "2026-09-06T11:00:00Z",
  created_by: "vscode-extension@0.1.0",
  experiment_id: EXPERIMENT_ID,
  role: "result",
  mode: "copy",
  source: { root: "project", path: "results/pca/pca_by_treatment.pdf" },
  payload: "pca_by_treatment.pdf",
  sha256: hex64("9b1c"),
  size: 88213,
  provenance: {
    repo: ".",
    commit: COMMIT,
    path_in_repo: "results/pca/pca_by_treatment.pdf",
    file_dirty: false,
    tree_dirty: false,
  },
  group_path: ["Figures", "QC"],
};

export const requestLinkSample: Record<string, unknown> = {
  format_version: 1,
  request_id: REQUEST_ID,
  created: "2026-09-06T11:00:00Z",
  created_by: "vscode-extension@0.1.0",
  experiment_id: EXPERIMENT_ID,
  role: "result",
  mode: "link",
  source: { root: "project", path: "data/counts.h5" },
  payload: null,
  sha256: hex64("c21f"),
  size: 18400000000,
  provenance: null,
};

export const bibliographySample: unknown[] = [
  {
    id: "z:u:7XK2PQ9M",
    type: "article-journal",
    title:
      "Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2",
    author: [{ family: "Love", given: "M. I." }],
    _zotero: {
      server_id: "b6f0c1de",
      library: "u",
      key: "7XK2PQ9M",
      fetched: "2026-09-03T13:00:00Z",
      status: "ok",
    },
  },
  {
    id: "z:g4521:ABCD2345",
    type: "book",
    title: "A group library book",
    _zotero: {
      server_id: null,
      library: "g4521",
      key: "ABCD2345",
      fetched: "2026-09-04T08:00:00Z",
      status: "trashed",
    },
  },
];

export const lockSample: Record<string, unknown> = {
  host: "LAB-PC-07",
  pid: 18244,
  app_version: "0.1.0",
  opened: "2026-09-15T10:00:00Z",
  heartbeat: "2026-09-15T10:04:00Z",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns a copy of `node` with `value` set at `path`; `node` is not mutated. */
export function setIn(
  node: unknown,
  path: readonly (string | number)[],
  value: unknown,
): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (Array.isArray(node)) {
    const items: unknown[] = node;
    const copy = [...items];
    copy[Number(head)] = setIn(copy[Number(head)], rest, value);
    return copy;
  }
  const record: Record<string, unknown> = isRecord(node) ? { ...node } : {};
  record[String(head)] = setIn(record[String(head)], rest, value);
  return record;
}

/** Returns a copy of `node` with the key at `path` removed. */
export function removeIn(
  node: unknown,
  path: readonly (string | number)[],
): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return node;
  if (rest.length === 0) {
    if (Array.isArray(node)) return node.filter((_, i) => i !== Number(head));
    if (!isRecord(node)) return node;
    return Object.fromEntries(
      Object.entries(node).filter(([key]) => key !== String(head)),
    );
  }
  if (Array.isArray(node)) {
    const items: unknown[] = node;
    const copy = [...items];
    copy[Number(head)] = removeIn(copy[Number(head)], rest);
    return copy;
  }
  if (!isRecord(node)) return node;
  return { ...node, [String(head)]: removeIn(node[String(head)], rest) };
}
