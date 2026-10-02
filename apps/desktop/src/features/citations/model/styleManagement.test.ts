import {
  AUTHOR_DATE_STYLE,
  EN_US_LOCALE,
  NUMERIC_STYLE,
  renderLiterature,
} from "@research-notebook/citations";
import {
  createExperiment,
  createQuestion,
  editExperimentSection,
  newProject,
  type BibliographyItemModel,
  type CitationStyleChange,
  type NotebookEnv,
  type NotebookState,
} from "@research-notebook/format";
import { describe, expect, it, vi } from "vitest";
import {
  chooseStyle,
  type StyleEnv,
  type StyleOutcome,
} from "./styleManagement";

/** FR-CIT-10, FR-CIT-11: choosing a style copies it in, never overwrites a different file, and regenerates what it can. */

const SMITH = "z:u:SMIT2222";
const ENV: NotebookEnv = {
  now: () => new Date("2026-10-02T10:00:00Z"),
  newId: (() => {
    let n = 0;
    return () => `01JAX${String((n += 1)).padStart(21, "0")}`;
  })(),
  appVersion: "0.2.0",
};

const smith: BibliographyItemModel = {
  id: SMITH,
  type: "book",
  title: "Widgets",
  author: [{ family: "Smith", given: "Pat" }],
  issued: { "date-parts": [[2020]] },
  _zotero: {
    server_id: null,
    library: "u",
    key: "SMIT2222",
    fetched: "2026-10-02T09:00:00Z",
    status: "ok",
  },
};

function numericBlock(): string {
  const result = renderLiterature({
    clusters: [
      {
        items: [
          { prefix: "", suppressAuthor: false, citekey: SMITH, suffix: "" },
        ],
      },
    ],
    items: [smith],
    styleXml: NUMERIC_STYLE,
    localeXml: EN_US_LOCALE,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.text;
}

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

/** Two experiments citing Smith; the second one's block was edited by hand. */
function project(): NotebookState {
  let state: NotebookState = {
    project: must(
      newProject(
        { name: "P", appVersion: "0.2.0" },
        { now: ENV.now, newId: () => "01JAXP0000000000000000000A" },
      ),
    ).project,
    questions: [],
    experiments: [],
    reservedRefs: [],
    unreadable: [],
  };
  state = must(createQuestion(state, { title: "Q" }, ENV)).next;
  const questionId = state.questions[0]?.file.frontmatter.id ?? "";
  for (const title of ["One", "Two"]) {
    state = must(createExperiment(state, { questionId, title }, ENV)).next;
  }
  const [one, two] = state.experiments.map((e) => e.file.frontmatter.id);
  const text = `Counted [@${SMITH}].`;
  state = must(
    editExperimentSection(state, one ?? "", "methods", text, ENV, {
      literature: numericBlock(),
    }),
  ).next;
  return must(
    editExperimentSection(state, two ?? "", "methods", text, ENV, {
      literature: "1. Rewritten by hand.",
    }),
  ).next;
}

function files(existing: Record<string, string> = {}) {
  return {
    readNotebookFile: vi.fn((_folder: unknown, path: string) => {
      const text = existing[path.replace("_notebook/styles/", "")];
      return Promise.resolve({
        status: "ok",
        data:
          text === undefined
            ? { kind: "missing" }
            : { kind: "text", text, sha256: "x" },
      });
    }),
  };
}

function setup(
  options: { existing?: Record<string, string>; saved?: boolean } = {},
) {
  const applied: CitationStyleChange[] = [];
  const api = files(options.existing);
  const env: StyleEnv = {
    api: api as never,
    folder: 7,
    state: project(),
    items: [smith],
    render: (input) => Promise.resolve(renderLiterature(input)),
    apply: (change) => {
      applied.push(change);
      return Promise.resolve(options.saved ?? true);
    },
  };
  return { env, applied, api };
}

const outcome = (o: StyleOutcome) => o.kind;

describe("chooseStyle", () => {
  it("copies a bundled style into styles/ and regenerates the unedited block", async () => {
    const { env, applied } = setup();
    const done = await chooseStyle(env, {
      kind: "bundled",
      file: "author-date.csl",
    });
    expect(done).toEqual({ kind: "changed", keptEdited: 1 });
    expect(applied).toHaveLength(1);
    const change = applied[0];
    expect(change?.file).toBe("author-date.csl");
    expect(change?.copy).toBe(AUTHOR_DATE_STYLE);
    const blocks = Object.values(change?.literature ?? {});
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("Smith");
  });

  it("keeps a block the person edited by hand and says how many", async () => {
    const { env, applied } = setup();
    const done = await chooseStyle(env, {
      kind: "bundled",
      file: "author-date.csl",
    });
    const [, two] = env.state.experiments.map((e) => e.file.frontmatter.id);
    expect(Object.keys(applied[0]?.literature ?? {})).not.toContain(two);
    expect(done).toMatchObject({ keptEdited: 1 });
  });

  it("imports a valid style under a safe name, with LF endings", async () => {
    const { env, applied } = setup();
    const text = AUTHOR_DATE_STYLE.replace(/\n/g, "\r\n");
    const done = await chooseStyle(env, {
      kind: "imported",
      fileName: "My Journal.csl",
      text,
    });
    expect(outcome(done)).toBe("changed");
    expect(applied[0]?.file).toBe("my-journal.csl");
    expect(applied[0]?.copy).toBe(AUTHOR_DATE_STYLE);
  });

  it("rejects a note style without writing anything", async () => {
    const { env, applied } = setup();
    const note = NUMERIC_STYLE.replace('class="in-text"', 'class="note"');
    const done = await chooseStyle(env, {
      kind: "imported",
      fileName: "note.csl",
      text: note,
    });
    expect(done).toEqual({ kind: "refused", problem: { kind: "noteStyle" } });
    expect(applied).toEqual([]);
  });

  it("never overwrites a different file of the same name", async () => {
    const { env, applied } = setup({ existing: { "numeric.csl": "<other/>" } });
    const done = await chooseStyle(env, {
      kind: "bundled",
      file: "numeric.csl",
    });
    expect(done).toEqual({ kind: "refused", problem: { kind: "nameTaken" } });
    expect(applied).toEqual([]);
  });

  it("adopts an identical file already in styles/ without copying it", async () => {
    const { env, applied } = setup({
      existing: { "author-date.csl": AUTHOR_DATE_STYLE },
    });
    await chooseStyle(env, { kind: "bundled", file: "author-date.csl" });
    expect(applied[0]?.copy).toBeUndefined();
  });

  it("does nothing when the styles/ folder cannot be read", async () => {
    const { env, applied, api } = setup();
    api.readNotebookFile.mockResolvedValue({
      status: "error",
      error: { kind: "fileUnavailable" },
    } as never);
    const done = await chooseStyle(env, {
      kind: "bundled",
      file: "numeric.csl",
    });
    expect(outcome(done)).toBe("failed");
    expect(applied).toEqual([]);
  });

  it("refuses a bundled style that does not exist", async () => {
    const { env } = setup();
    const done = await chooseStyle(env, { kind: "bundled", file: "nope.csl" });
    expect(outcome(done)).toBe("refused");
  });

  it("reports a failed save", async () => {
    const { env } = setup({ saved: false });
    const done = await chooseStyle(env, {
      kind: "bundled",
      file: "author-date.csl",
    });
    expect(outcome(done)).toBe("failed");
  });
});
