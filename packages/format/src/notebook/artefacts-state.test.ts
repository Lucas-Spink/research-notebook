import { describe, expect, it } from "vitest";
import { emptyState, must, testEnv } from "../../test/notebook-support";
import { serialiseArtefacts } from "../files/artefacts";
import type { ArtefactsFileModel } from "../schema";
import {
  arrangeNotebook,
  artefactsOf,
  artefactsPath,
  createExperiment,
  createQuestion,
  editArtefacts,
  EMPTY_ARTEFACTS,
  PROJECT_PATH,
  removeExperiment,
  type NotebookError,
  type NotebookState,
} from "../index";

/**
 * ADR-0044 point 3: each experiment's artefacts.yaml is part of the loaded
 * notebook, and a change to it is an ordinary plan, written like any other.
 */

const env = (appVersion = "0.2.0") => testEnv({ appVersion });

function sample(): { state: NotebookState; folder: string; id: string } {
  // One environment, so the question and the experiment get different IDs.
  const shared = env();
  const base = must(createQuestion(emptyState(), { title: "Q" }, shared)).next;
  const question = base.questions[0]?.file.frontmatter.id ?? "";
  const state = must(
    createExperiment(base, { questionId: question, title: "E" }, shared),
  ).next;
  const experiment = state.experiments[0];
  if (experiment === undefined) throw new Error("sample");
  return {
    state,
    folder: experiment.folder,
    id: experiment.file.frontmatter.id,
  };
}

const withGroup = (file: ArtefactsFileModel): ArtefactsFileModel => ({
  ...file,
  groups: [
    {
      id: "01JB00000000000000000000GG",
      name: "Figures",
      items: [],
      groups: [],
    },
  ],
});

describe("createExperiment", () => {
  it("records the empty artefacts.yaml it creates in the next state", () => {
    const { state, folder } = sample();
    expect(state.artefacts?.[folder]).toEqual({
      kind: "file",
      file: EMPTY_ARTEFACTS,
    });
  });
});

describe("removeExperiment", () => {
  it("drops the removed experiment's artefacts", () => {
    const { state, folder, id } = sample();
    const next = must(removeExperiment(state, id, env())).next;
    expect(next.artefacts?.[folder]).toBeUndefined();
  });
});

describe("artefactsOf", () => {
  it("gives the loaded file, an empty one when there is none, and null when it could not be read", () => {
    const { state, folder } = sample();
    expect(artefactsOf(state, folder)).toEqual(EMPTY_ARTEFACTS);
    expect(artefactsOf({ ...state, artefacts: {} }, folder)).toEqual(
      EMPTY_ARTEFACTS,
    );
    expect(
      artefactsOf(
        { ...state, artefacts: { [folder]: { kind: "unreadable" } } },
        folder,
      ),
    ).toBeNull();
  });
});

describe("arrangeNotebook", () => {
  it("carries each experiment's artefacts to where it is shown", () => {
    const { state, folder } = sample();
    const arranged = arrangeNotebook(state);
    const shown = arranged.questions[0]?.experiments[0];
    expect(shown?.experiment.folder).toBe(folder);
    expect(shown?.artefacts).toEqual({ kind: "file", file: EMPTY_ARTEFACTS });
  });
});

describe("editArtefacts", () => {
  it("replaces artefacts.yaml with the changed file, and holds it in the next state", () => {
    const { state, folder } = sample();
    const plan = must(
      editArtefacts(
        state,
        folder,
        (file) => ({ ok: true, value: withGroup(file) }),
        env(),
      ),
    );
    expect(plan.steps).toEqual([
      {
        kind: "replace",
        path: artefactsPath(folder),
        text: serialiseArtefacts(withGroup(EMPTY_ARTEFACTS)),
      },
    ]);
    expect(plan.next.artefacts?.[folder]).toEqual({
      kind: "file",
      file: withGroup(EMPTY_ARTEFACTS),
    });
  });

  it("creates artefacts.yaml for an experiment that has none", () => {
    const { state, folder } = sample();
    const plan = must(
      editArtefacts(
        { ...state, artefacts: {} },
        folder,
        (file) => ({ ok: true, value: withGroup(file) }),
        env(),
      ),
    );
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["create", artefactsPath(folder)],
    ]);
  });

  it("writes nothing when nothing changes", () => {
    const { state, folder } = sample();
    const plan = must(
      editArtefacts(
        state,
        folder,
        (file) => ({ ok: true, value: file }),
        env(),
      ),
    );
    expect(plan.steps).toEqual([]);
    expect(plan.next).toEqual(state);
  });

  it("records the running version in project.yaml first, as other edits do", () => {
    const { state, folder } = sample();
    const plan = must(
      editArtefacts(
        state,
        folder,
        (file) => ({ ok: true, value: withGroup(file) }),
        env("0.3.0"),
      ),
    );
    expect(plan.steps.map((s) => s.path)).toEqual([
      PROJECT_PATH,
      artefactsPath(folder),
    ]);
  });

  it("refuses to write over an artefacts.yaml that could not be read (AGENTS.md rule 5)", () => {
    const { state, folder } = sample();
    const result = editArtefacts(
      { ...state, artefacts: { [folder]: { kind: "unreadable" } } },
      folder,
      (file) => ({ ok: true, value: withGroup(file) }),
      env(),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses an experiment that does not exist", () => {
    const { state } = sample();
    const result = editArtefacts(
      state,
      "EXP-999",
      (file) => ({ ok: true, value: file }),
      env(),
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: "notFound", entity: "experiment", id: "EXP-999" },
    });
  });

  it("passes on a refusal from the change, writing nothing", () => {
    const { state, folder } = sample();
    const refusal: NotebookError = { kind: "invalid", message: "no" };
    const result = editArtefacts(
      state,
      folder,
      () => ({ ok: false, error: refusal }),
      env(),
    );
    expect(result).toEqual({ ok: false, error: refusal });
  });
});
