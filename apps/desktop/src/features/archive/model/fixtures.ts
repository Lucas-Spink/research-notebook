import {
  ArtefactsFile,
  ProjectYaml,
  type Arranged,
  type ProjectYamlModel,
} from "@research-notebook/format";

/** One experiment with a captured artefact of two versions and a linked one, for the manifest tests. */
export const ID = (n: number) => `01JB000000000000000000000${n}`;
const LINKED = ID(1);
const COPIED = ID(2);
const HASH = "a".repeat(64);

const artefacts = ArtefactsFile.parse({
  format_version: 1,
  artefacts: [
    {
      id: COPIED,
      name: "Plot",
      role: "result",
      mode: "copy",
      type: "pdf",
      source: { root: "project", path: "plot.pdf" },
      created: "2026-09-03T14:02:11Z",
      versions: [
        {
          v: 1,
          file: "evidence/plot.pdf",
          sha256: HASH,
          size: 3,
          captured: "2026-09-03T14:02:11Z",
        },
        {
          v: 2,
          file: "evidence/plot.v2.pdf",
          sha256: HASH,
          size: 3,
          captured: "2026-09-04T14:02:11Z",
        },
      ],
    },
    {
      id: LINKED,
      name: "Counts",
      role: "result",
      mode: "link",
      type: "other",
      source: { root: "project", path: "data/counts.h5" },
      created: "2026-09-02T10:00:00Z",
      link: {
        sha256: HASH,
        size: 10,
        observed_mtime: "2026-08-30T22:14:09Z",
        checked: "2026-09-05T16:00:00Z",
      },
    },
  ],
  groups: [],
});

export function arranged(): Arranged {
  return {
    questions: [],
    problems: [],
    unassigned: [
      {
        readOnly: false,
        absentFromOrder: true,
        artefacts: { kind: "file", file: artefacts },
        experiment: {
          folder: "EXP-001",
          file: {
            frontmatter: {
              id: "01JAXEXP001000000000000000",
              ref: "EXP-001",
              question: "Q1",
              title: "One",
              status: "planned",
              created: "2026-09-21T10:00:00Z",
              updated: "2026-09-21T10:00:00Z",
            },
            body: { preamble: "", sections: [], literature: null },
          },
        },
      },
    ],
  };
}

/**
 * The same experiment with one captured artefact whose versions were taken
 * from `repos`, one version per repository, so the git bundle tests have
 * repositories to name.
 */
export function arrangedWithRepositories(repos: readonly string[]): Arranged {
  const file = ArtefactsFile.parse({
    format_version: 1,
    artefacts: [
      {
        id: COPIED,
        name: "Plot",
        role: "result",
        mode: "copy",
        type: "pdf",
        source: { root: "project", path: "plot.pdf" },
        created: "2026-09-03T14:02:11Z",
        versions: repos.map((repo, index) => ({
          v: index + 1,
          file: `evidence/plot.v${index + 1}.pdf`,
          sha256: HASH,
          size: 3,
          captured: "2026-09-03T14:02:11Z",
          provenance: {
            repo,
            commit: "d".repeat(40),
            path_in_repo: "plot.R",
            file_dirty: false,
            tree_dirty: false,
          },
        })),
      },
    ],
    groups: [],
  });
  const result = arranged();
  const [item] = result.unassigned;
  if (item === undefined) throw new Error("fixture");
  item.artefacts = { kind: "file", file };
  return result;
}

/** The experiment with one captured image and one captured table, which the HTML export prepares. */
export function arrangedWithFigures(): Arranged {
  const copy = (id: number, name: string, type: string, file: string) => ({
    id: ID(id),
    name,
    role: "result",
    mode: "copy",
    type,
    source: { root: "project", path: file },
    created: "2026-09-03T14:02:11Z",
    versions: [
      {
        v: 1,
        file: `evidence/${file}`,
        sha256: String(id).repeat(64),
        size: 3,
        captured: "2026-09-03T14:02:11Z",
      },
    ],
  });
  const file = ArtefactsFile.parse({
    format_version: 1,
    artefacts: [
      copy(3, "Volcano", "image", "volcano.png"),
      copy(4, "Counts", "table", "counts.csv"),
    ],
    groups: [],
  });
  const result = arranged();
  const [item] = result.unassigned;
  if (item === undefined) throw new Error("fixture");
  item.artefacts = { kind: "file", file };
  return result;
}

/** A valid `project.yaml` for the machine-readable export tests. */
export function projectYaml(): ProjectYamlModel {
  return ProjectYaml.parse({
    format_version: 1,
    id: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
    name: "Yeast",
    created: "2026-09-01T09:12:44Z",
    last_written_by: "0.1.0",
    archived: null,
    locale: "en-GB",
    citation_style: "nature.csl",
    capture: { copy_threshold_mb: 100, evidence_in_git: false },
    numbering: { next_question: 1, next_experiment: 2 },
    order: [],
    table: {
      columns: [
        { key: "motivation", width: 200, hidden: false },
        { key: "methods", width: 200, hidden: false },
        { key: "results", width: 200, hidden: false },
        { key: "results_notes", width: 200, hidden: false },
        { key: "interpretation", width: 200, hidden: false },
        { key: "literature", width: 200, hidden: false },
      ],
      collapsed_questions: [],
    },
    external_roots: [],
  });
}
