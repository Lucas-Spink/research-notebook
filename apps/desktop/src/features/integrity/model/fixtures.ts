import { ArtefactsFile, type Arranged } from "@research-notebook/format";

/** One experiment with a captured artefact of two versions and a linked one, for the integrity tests. */
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
