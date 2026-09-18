import { describe, expect, it } from "vitest";
import {
  ArtefactsFile,
  BibliographyFile,
  Citekey,
  ExperimentBody,
  ExperimentFrontmatter,
  ExperimentRef,
  FormatVersionProbe,
  GitCommit,
  InboxRequest,
  IsoDate,
  LockFile,
  ProjectYaml,
  QuestionFrontmatter,
  QuestionRef,
  RelativePath,
  Sha256,
  Timestamp,
  Ulid,
} from "../src/schema";
import {
  ARTEFACT_BATCH,
  ARTEFACT_RAW,
  ARTEFACT_SCRIPT,
  ARTEFACT_TREATMENT,
  EXPERIMENT_ID,
  EXPERIMENT_ID_2,
  GROUP_FIGURES,
  QUESTION_ID,
  artefactsSample,
  bibliographySample,
  experimentSample,
  hex64,
  lockSample,
  projectSample,
  questionSample,
  removeIn,
  requestCopySample,
  requestLinkSample,
  setIn,
} from "./samples";

function accepts(
  schema: { safeParse: (v: unknown) => { success: boolean } },
  value: unknown,
) {
  return schema.safeParse(value).success;
}

describe("primitives", () => {
  it("accepts strict Crockford ULIDs only", () => {
    expect(accepts(Ulid, "01JAX9Q2B7N4M8T6V3W5Y1Z0KC")).toBe(true);
    for (const bad of [
      "01jax9q2b7n4m8t6v3w5y1z0kc", // lowercase
      "01JAX9Q2B7N4M8T6V3W5Y1Z0K", // 25 characters
      "01JAX9Q2B7N4M8T6V3W5Y1Z0KCC", // 27 characters
      "01JAX9Q2B7N4M8T6V3W5Y1Z0KI", // I is excluded from Crockford
      "01JAX9Q2B7N4M8T6V3W5Y1Z0KL", // L
      "01JAX9Q2B7N4M8T6V3W5Y1Z0KO", // O
      "01JAX9Q2B7N4M8T6V3W5Y1Z0KU", // U
      "81JAX9Q2B7N4M8T6V3W5Y1Z0KC", // first character above 7 overflows 128 bits
      "",
    ]) {
      expect(accepts(Ulid, bad), bad).toBe(false);
    }
  });

  it("accepts second-precision UTC timestamps only", () => {
    expect(accepts(Timestamp, "2026-09-15T10:42:07Z")).toBe(true);
    for (const bad of [
      "2026-09-15T10:42:07.500Z",
      "2026-09-15T12:42:07+02:00",
      "2026-09-15 10:42:07Z",
      "2026-09-15T10:42:07",
      "2026-09-15T10:42:07z",
      "2026-02-30T10:00:00Z",
      "2026-09-15T24:00:00Z",
      "2026-09-15T10:60:00Z",
    ]) {
      expect(accepts(Timestamp, bad), bad).toBe(false);
    }
  });

  it("accepts real ISO calendar dates only", () => {
    expect(accepts(IsoDate, "2026-09-15")).toBe(true);
    expect(accepts(IsoDate, "2028-02-29")).toBe(true);
    for (const bad of [
      "2026-9-15",
      "2026-02-30",
      "2027-02-29",
      "15/09/2026",
      "2026-09-15T00:00:00Z",
    ]) {
      expect(accepts(IsoDate, bad), bad).toBe(false);
    }
  });

  it("accepts relative NFC forward-slash paths only", () => {
    for (const good of [
      "scripts/02_pca.R",
      "evidence/a.v2.pdf",
      "data",
      "caf\u00e9/notes.txt",
    ]) {
      expect(accepts(RelativePath, good), good).toBe(true);
    }
    for (const bad of [
      "",
      ".",
      "/abs/path",
      "//server/share",
      "C:/data/x.csv",
      "C:\\data\\x.csv",
      "a\\b",
      "../x",
      "a/../b",
      "a/./b",
      "./a",
      "a//b",
      "a/",
      "a\u0000b",
      "cafe\u0301/notes.txt", // decomposed, not NFC
    ]) {
      expect(accepts(RelativePath, bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("accepts lowercase 64-character SHA-256 and 40-character commits only", () => {
    expect(accepts(Sha256, hex64("9b1c"))).toBe(true);
    expect(accepts(Sha256, hex64("9B1C"))).toBe(false);
    expect(accepts(Sha256, hex64("9b1c").slice(1))).toBe(false);
    expect(accepts(Sha256, `${hex64("9b1c")}0`)).toBe(false);
    expect(accepts(Sha256, hex64("zzzz"))).toBe(false);
    expect(accepts(GitCommit, "3f9c1e2d3f9c1e2d3f9c1e2d3f9c1e2d3f9c1e2d")).toBe(
      true,
    );
    expect(accepts(GitCommit, "3f9c1e2d\u2026")).toBe(false);
    expect(accepts(GitCommit, "3f9c1e2d")).toBe(false);
  });

  it("accepts refs with at least three digits and no extra leading zeros", () => {
    for (const good of ["Q-001", "Q-003", "Q-1000"])
      expect(accepts(QuestionRef, good), good).toBe(true);
    for (const bad of ["Q-01", "Q-0001", "Q-000", "q-001", "EXP-001", "Q-"]) {
      expect(accepts(QuestionRef, bad), bad).toBe(false);
    }
    for (const good of ["EXP-042", "EXP-1000"])
      expect(accepts(ExperimentRef, good), good).toBe(true);
    for (const bad of ["EXP-0042", "EXP-42", "exp-042", "Q-042"]) {
      expect(accepts(ExperimentRef, bad), bad).toBe(false);
    }
  });

  it("accepts citekeys in the spec 5.7 grammar only", () => {
    for (const good of ["z:u:7XK2PQ9M", "z:g4521:ABCD2345"])
      expect(accepts(Citekey, good), good).toBe(true);
    for (const bad of [
      "z:u:7XK2PQ9",
      "z:u:7xk2pq9m",
      "z:u:0XK2PQ9M",
      "z:g:ABCD2345",
      "z:x:ABCD2345",
      "u:7XK2PQ9M",
    ]) {
      expect(accepts(Citekey, bad), bad).toBe(false);
    }
  });
});

describe("FormatVersionProbe", () => {
  it("reads the version of a newer-format file without validating the rest", () => {
    const result = FormatVersionProbe.safeParse({
      format_version: 2,
      anything: { new: true },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.format_version).toBe(2);
  });

  it("rejects a missing, non-integer or non-positive version", () => {
    for (const bad of [
      {},
      { format_version: "1" },
      { format_version: 1.5 },
      { format_version: 0 },
      { format_version: -1 },
    ]) {
      expect(accepts(FormatVersionProbe, bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("project.yaml", () => {
  it("accepts the spec example", () => {
    expect(ProjectYaml.safeParse(projectSample).success).toBe(true);
  });

  it("accepts an archived timestamp and external roots", () => {
    const value = setIn(
      setIn(projectSample, ["archived"], "2026-09-10T08:00:00Z"),
      ["external_roots"],
      [{ id: EXPERIMENT_ID, label: "Cluster scratch" }],
    );
    expect(accepts(ProjectYaml, value)).toBe(true);
  });

  it("keeps unknown keys at the top level and in nested objects", () => {
    const value = setIn(
      setIn(projectSample, ["x_top"], "kept"),
      ["capture", "x_nested"],
      7,
    );
    const result = ProjectYaml.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        x_top: "kept",
        capture: { x_nested: 7 },
      });
    }
  });

  it.each([
    "format_version",
    "id",
    "name",
    "created",
    "last_written_by",
    "archived",
    "locale",
    "citation_style",
    "capture",
    "numbering",
    "order",
    "table",
    "external_roots",
  ])("rejects a project.yaml missing %s", (key) => {
    expect(accepts(ProjectYaml, removeIn(projectSample, [key]))).toBe(false);
  });

  it.each([
    ["future format_version", ["format_version"], 2],
    ["lowercase project id", ["id"], "01jax9q2b7n4m8t6v3w5y1z0kc"],
    ["empty name", ["name"], ""],
    ["multi-line name", ["name"], "two\nlines"],
    ["archived that is not a timestamp", ["archived"], "yesterday"],
    ["underscore locale", ["locale"], "en_GB"],
    ["style with a path separator", ["citation_style"], "styles/nature.csl"],
    ["style that is not a .csl file", ["citation_style"], "nature.xml"],
    ["negative copy threshold", ["capture", "copy_threshold_mb"], -1],
    ["fractional copy threshold", ["capture", "copy_threshold_mb"], 1.5],
    ["non-boolean evidence_in_git", ["capture", "evidence_in_git"], "no"],
    ["zero next_question", ["numbering", "next_question"], 0],
    ["fractional next_experiment", ["numbering", "next_experiment"], 2.5],
    ["zero column width", ["table", "columns", 0, "width"], 0],
    ["fractional column width", ["table", "columns", 0, "width"], 10.5],
    ["unknown column key", ["table", "columns", 0, "key"], "owner"],
    [
      "non-ULID collapsed question",
      ["table", "collapsed_questions"],
      ["Q-003"],
    ],
  ])("rejects %s", (_label, path, value) => {
    expect(accepts(ProjectYaml, setIn(projectSample, path, value))).toBe(false);
  });

  it("rejects a table.columns list that repeats or omits a column", () => {
    const repeated = setIn(
      projectSample,
      ["table", "columns", 5, "key"],
      "methods",
    );
    expect(accepts(ProjectYaml, repeated)).toBe(false);
    expect(
      accepts(ProjectYaml, removeIn(projectSample, ["table", "columns", 5])),
    ).toBe(false);
  });

  it("rejects a repeated question or an experiment listed twice in order", () => {
    const twoQuestions = [
      { question: QUESTION_ID, experiments: [EXPERIMENT_ID] },
      { question: QUESTION_ID, experiments: [] },
    ];
    expect(
      accepts(ProjectYaml, setIn(projectSample, ["order"], twoQuestions)),
    ).toBe(false);
    const sameExperimentTwice = [
      { question: QUESTION_ID, experiments: [EXPERIMENT_ID] },
      { question: ARTEFACT_SCRIPT, experiments: [EXPERIMENT_ID] },
    ];
    expect(
      accepts(
        ProjectYaml,
        setIn(projectSample, ["order"], sameExperimentTwice),
      ),
    ).toBe(false);
    const repeatedInOne = [
      { question: QUESTION_ID, experiments: [EXPERIMENT_ID, EXPERIMENT_ID] },
    ];
    expect(
      accepts(ProjectYaml, setIn(projectSample, ["order"], repeatedInOne)),
    ).toBe(false);
  });

  it("rejects duplicate external root ids", () => {
    const roots = [
      { id: EXPERIMENT_ID, label: "A" },
      { id: EXPERIMENT_ID, label: "B" },
    ];
    expect(
      accepts(ProjectYaml, setIn(projectSample, ["external_roots"], roots)),
    ).toBe(false);
  });
});

describe("question files", () => {
  it("accepts the frontmatter and keeps unknown keys", () => {
    const result = QuestionFrontmatter.safeParse({
      ...questionSample,
      x_tag: "kept",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ x_tag: "kept" });
  });

  it.each(["id", "ref", "title", "created"])(
    "rejects frontmatter missing %s",
    (key) => {
      expect(
        accepts(QuestionFrontmatter, removeIn(questionSample, [key])),
      ).toBe(false);
    },
  );

  it("rejects an experiment ref on a question", () => {
    expect(
      accepts(QuestionFrontmatter, setIn(questionSample, ["ref"], "EXP-042")),
    ).toBe(false);
  });
});

describe("experiment files", () => {
  it("accepts the spec example frontmatter and keeps unknown keys", () => {
    const result = ExperimentFrontmatter.safeParse({
      ...experimentSample,
      x_owner: "lucas",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ x_owner: "lucas" });
  });

  it("accepts an experiment without started and completed", () => {
    const value = removeIn(removeIn(experimentSample, ["started"]), [
      "completed",
    ]);
    expect(accepts(ExperimentFrontmatter, value)).toBe(true);
  });

  it.each(["id", "ref", "question", "title", "status", "created", "updated"])(
    "rejects frontmatter missing %s",
    (key) => {
      expect(
        accepts(ExperimentFrontmatter, removeIn(experimentSample, [key])),
      ).toBe(false);
    },
  );

  it.each([
    ["unknown status", ["status"], "paused"],
    ["null started", ["started"], null],
    ["malformed started", ["started"], "2026-9-2"],
    ["timestamp in a date field", ["completed"], "2026-09-05T00:00:00Z"],
    ["question ref instead of id", ["question"], "Q-003"],
    ["question ref format", ["ref"], "Q-003"],
    ["empty title", ["title"], ""],
  ])("rejects %s", (_label, path, value) => {
    expect(
      accepts(ExperimentFrontmatter, setIn(experimentSample, path, value)),
    ).toBe(false);
  });

  it.each(["planned", "running", "complete", "abandoned"])(
    "accepts status %s",
    (status) => {
      expect(
        accepts(
          ExperimentFrontmatter,
          setIn(experimentSample, ["status"], status),
        ),
      ).toBe(true);
    },
  );
});

describe("experiment body model", () => {
  const body = {
    preamble: "Intro text\n",
    sections: [
      { key: "methods", body: "PCA on counts.\n" },
      { key: "unknown", heading: "Notes to self", body: "keep me\n" },
      { key: "results_notes", body: "" },
      { key: "interpretation", body: "Consistent with prior work.\n" },
    ],
    literature: "## Literature\n\n1. Love 2014.\n",
  };

  it("accepts recognised and unknown sections with a literature block", () => {
    expect(accepts(ExperimentBody, body)).toBe(true);
    expect(accepts(ExperimentBody, { ...body, literature: null })).toBe(true);
  });

  it("rejects a recognised heading that appears twice (spec 5.5 rule 5)", () => {
    const twice = {
      ...body,
      sections: [...body.sections, { key: "methods", body: "again\n" }],
    };
    expect(accepts(ExperimentBody, twice)).toBe(false);
  });

  it("allows the same unknown heading more than once", () => {
    const twice = {
      ...body,
      sections: [
        { key: "unknown", heading: "Scratch", body: "a\n" },
        { key: "unknown", heading: "Scratch", body: "b\n" },
      ],
    };
    expect(accepts(ExperimentBody, twice)).toBe(true);
  });
});

describe("artefacts.yaml", () => {
  it("accepts the spec example", () => {
    expect(ArtefactsFile.safeParse(artefactsSample).success).toBe(true);
  });

  it("accepts an empty file for a new experiment", () => {
    expect(
      accepts(ArtefactsFile, { format_version: 1, artefacts: [], groups: [] }),
    ).toBe(true);
  });

  it("keeps unknown keys on artefacts, versions, source and groups", () => {
    let value = setIn(artefactsSample, ["artefacts", 1, "x_a"], 1);
    value = setIn(value, ["artefacts", 1, "versions", 0, "x_v"], 2);
    value = setIn(value, ["artefacts", 1, "source", "x_s"], 3);
    value = setIn(value, ["groups", 0, "x_g"], 4);
    const result = ArtefactsFile.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) {
      const first = result.data.artefacts[1];
      expect(first).toMatchObject({ x_a: 1, source: { x_s: 3 } });
      expect(result.data.groups[0]).toMatchObject({ x_g: 4 });
    }
  });

  it("accepts version numbers with gaps because a version may be deleted to trash", () => {
    const gap = setIn(artefactsSample, ["artefacts", 1, "versions", 1, "v"], 5);
    expect(accepts(ArtefactsFile, gap)).toBe(true);
  });

  it.each([
    ["future format_version", ["format_version"], 2],
    ["unknown role", ["artefacts", 1, "role"], "figure"],
    ["unknown mode", ["artefacts", 1, "mode"], "move"],
    ["unknown type", ["artefacts", 1, "type"], "spreadsheet"],
    ["unknown source root", ["artefacts", 1, "source", "root"], "elsewhere"],
    [
      "absolute source path",
      ["artefacts", 1, "source", "path"],
      "/results/a.pdf",
    ],
    [
      "traversal in source path",
      ["artefacts", 1, "source", "path"],
      "../a.pdf",
    ],
    ["empty display name", ["artefacts", 1, "name"], ""],
    ["version zero", ["artefacts", 1, "versions", 0, "v"], 0],
    ["fractional version", ["artefacts", 1, "versions", 0, "v"], 1.5],
    [
      "versions not ascending",
      ["artefacts", 1, "versions"],
      [
        {
          v: 2,
          file: "evidence/a.v2.pdf",
          sha256: hex64("aa"),
          size: 1,
          captured: "2026-09-05T09:40:52Z",
        },
        {
          v: 1,
          file: "evidence/a.pdf",
          sha256: hex64("bb"),
          size: 1,
          captured: "2026-09-03T14:02:11Z",
        },
      ],
    ],
    ["repeated version number", ["artefacts", 1, "versions", 1, "v"], 1],
    ["no versions for a copy artefact", ["artefacts", 1, "versions"], []],
    [
      "version file outside evidence and methods",
      ["artefacts", 1, "versions", 0, "file"],
      "other/a.pdf",
    ],
    [
      "version file with traversal",
      ["artefacts", 1, "versions", 0, "file"],
      "evidence/../../a.pdf",
    ],
    [
      "uppercase sha256",
      ["artefacts", 1, "versions", 0, "sha256"],
      hex64("9B1C"),
    ],
    ["negative size", ["artefacts", 1, "versions", 0, "size"], -1],
    [
      "fractional-second capture time",
      ["artefacts", 1, "versions", 0, "captured"],
      "2026-09-03T14:02:11.5Z",
    ],
    [
      "abbreviated provenance commit",
      ["artefacts", 0, "versions", 0, "provenance", "commit"],
      "3f9c1e2d",
    ],
    [
      "non-boolean file_dirty",
      ["artefacts", 0, "versions", 0, "provenance", "file_dirty"],
      "no",
    ],
    [
      "absolute provenance repo",
      ["artefacts", 0, "versions", 0, "provenance", "repo"],
      "/home/me/repo",
    ],
    [
      "link artefact that also has versions",
      ["artefacts", 3, "versions"],
      [
        {
          v: 1,
          file: "evidence/x.h5",
          sha256: hex64("aa"),
          size: 1,
          captured: "2026-09-05T09:40:52Z",
        },
      ],
    ],
    [
      "copy artefact that also has a link record",
      ["artefacts", 1, "link"],
      {
        sha256: hex64("aa"),
        size: 1,
        observed_mtime: "2026-09-05T09:40:52Z",
        checked: "2026-09-05T09:40:52Z",
      },
    ],
    [
      "link artefact without a link record",
      ["artefacts", 3, "link"],
      undefined,
    ],
    [
      "link record with a bad observed_mtime",
      ["artefacts", 3, "link", "observed_mtime"],
      "yesterday",
    ],
    ["group without a name", ["groups", 0, "name"], ""],
  ])("rejects %s", (_label, path, value) => {
    const input =
      value === undefined
        ? removeIn(artefactsSample, path)
        : setIn(artefactsSample, path, value);
    expect(accepts(ArtefactsFile, input)).toBe(false);
  });

  it.each(["repo", "commit", "path_in_repo", "file_dirty", "tree_dirty"])(
    "rejects provenance missing %s",
    (key) => {
      const input = removeIn(artefactsSample, [
        "artefacts",
        0,
        "versions",
        0,
        "provenance",
        key,
      ]);
      expect(accepts(ArtefactsFile, input)).toBe(false);
    },
  );

  it("accepts a link artefact that names an external root by ULID", () => {
    const value = setIn(
      artefactsSample,
      ["artefacts", 3, "source", "root"],
      EXPERIMENT_ID_2,
    );
    expect(accepts(ArtefactsFile, value)).toBe(true);
  });

  it("rejects duplicate artefact ids", () => {
    const value = setIn(
      artefactsSample,
      ["artefacts", 2, "id"],
      ARTEFACT_TREATMENT,
    );
    expect(accepts(ArtefactsFile, value)).toBe(false);
  });

  it("rejects a group id used twice anywhere in the tree", () => {
    const value = setIn(
      artefactsSample,
      ["groups", 0, "groups", 0, "id"],
      GROUP_FIGURES,
    );
    expect(accepts(ArtefactsFile, value)).toBe(false);
  });

  it("rejects a group item that is not an artefact in this file", () => {
    const value = setIn(
      artefactsSample,
      ["groups", 0, "items"],
      [ARTEFACT_TREATMENT, EXPERIMENT_ID],
    );
    expect(accepts(ArtefactsFile, value)).toBe(false);
  });

  it("rejects a method-role artefact in a group", () => {
    const value = setIn(
      artefactsSample,
      ["groups", 0, "items"],
      [ARTEFACT_SCRIPT],
    );
    expect(accepts(ArtefactsFile, value)).toBe(false);
  });

  it("rejects an artefact listed twice in one group", () => {
    const value = setIn(
      artefactsSample,
      ["groups", 0, "items"],
      [ARTEFACT_TREATMENT, ARTEFACT_TREATMENT],
    );
    expect(accepts(ArtefactsFile, value)).toBe(false);
  });

  it("allows one artefact in several groups, including a nested group", () => {
    // ARTEFACT_BATCH is a member of both Figures and its child QC in the sample.
    expect(accepts(ArtefactsFile, artefactsSample)).toBe(true);
    const value = setIn(
      artefactsSample,
      ["groups", 0, "groups", 0, "items"],
      [ARTEFACT_BATCH, ARTEFACT_RAW],
    );
    expect(accepts(ArtefactsFile, value)).toBe(true);
  });
});

describe("inbox request.json", () => {
  it("accepts a copy-mode and a link-mode request", () => {
    expect(InboxRequest.safeParse(requestCopySample).success).toBe(true);
    expect(InboxRequest.safeParse(requestLinkSample).success).toBe(true);
  });

  it("keeps unknown keys", () => {
    const result = InboxRequest.safeParse({
      ...requestCopySample,
      x_client: "kept",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ x_client: "kept" });
  });

  it.each([
    "format_version",
    "request_id",
    "created",
    "created_by",
    "experiment_id",
    "role",
    "mode",
    "source",
    "payload",
    "sha256",
    "size",
    "provenance",
  ])("rejects a request missing %s", (key) => {
    expect(accepts(InboxRequest, removeIn(requestCopySample, [key]))).toBe(
      false,
    );
  });

  it.each([
    ["future format_version", ["format_version"], 2],
    ["unknown role", ["role"], "figure"],
    ["null payload in copy mode", ["payload"], null],
    ["payload naming a subfolder", ["payload"], "sub/pca.pdf"],
    ["payload with a backslash", ["payload"], "sub\\pca.pdf"],
    ["payload traversal", ["payload"], ".."],
    ["negative size", ["size"], -5],
    ["uppercase sha256", ["sha256"], hex64("9B1C")],
    ["empty group_path entry", ["group_path"], ["Figures", ""]],
    ["non-list group_path", ["group_path"], "Figures"],
  ])("rejects %s", (_label, path, value) => {
    expect(accepts(InboxRequest, setIn(requestCopySample, path, value))).toBe(
      false,
    );
  });

  it("rejects a payload in link mode", () => {
    expect(
      accepts(InboxRequest, setIn(requestLinkSample, ["payload"], "counts.h5")),
    ).toBe(false);
  });

  it("allows group_path to be omitted", () => {
    expect(
      accepts(InboxRequest, removeIn(requestCopySample, ["group_path"])),
    ).toBe(true);
  });
});

describe("bibliography.json", () => {
  it("accepts a CSL-JSON array and keeps arbitrary CSL fields", () => {
    const result = BibliographyFile.safeParse(bibliographySample);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data[0]).toHaveProperty("title");
  });

  it("accepts an empty bibliography", () => {
    expect(accepts(BibliographyFile, [])).toBe(true);
  });

  it("rejects a non-array root", () => {
    expect(accepts(BibliographyFile, { items: [] })).toBe(false);
  });

  it.each([
    ["id that is not a citekey", ["0", "id"], "smith2020"],
    ["missing _zotero", ["0", "_zotero"], undefined],
    ["unknown status", ["0", "_zotero", "status"], "deleted"],
    ["bad fetched time", ["0", "_zotero", "fetched"], "today"],
    ["bad library", ["0", "_zotero", "library"], "x"],
    ["short item key", ["0", "_zotero", "key"], "7XK2"],
    ["id that disagrees with library and key", ["0", "id"], "z:u:AAAAAAAA"],
  ])("rejects an item with %s", (_label, [index, ...path], value) => {
    const at = [Number(index), ...path];
    const input =
      value === undefined
        ? removeIn(bibliographySample, at)
        : setIn(bibliographySample, at, value);
    expect(accepts(BibliographyFile, input)).toBe(false);
  });

  it("rejects duplicate citekeys", () => {
    expect(
      accepts(BibliographyFile, [bibliographySample[0], bibliographySample[0]]),
    ).toBe(false);
  });
});

describe(".lock", () => {
  it("accepts the spec 5.11 shape and keeps unknown keys", () => {
    const result = LockFile.safeParse({ ...lockSample, x_extra: 1 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ x_extra: 1 });
  });

  it.each(["host", "pid", "app_version", "opened", "heartbeat"])(
    "rejects a lock missing %s",
    (key) => {
      expect(accepts(LockFile, removeIn(lockSample, [key]))).toBe(false);
    },
  );

  it.each([
    ["empty host", ["host"], ""],
    ["zero pid", ["pid"], 0],
    ["fractional pid", ["pid"], 1.5],
    ["bad heartbeat", ["heartbeat"], "now"],
  ])("rejects %s", (_label, path, value) => {
    expect(accepts(LockFile, setIn(lockSample, path, value))).toBe(false);
  });
});
