import type { NotebookError, Problem } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import {
  artefactTypeLabel,
  artefactVersionLabel,
  editLabel,
  loadFailureMessage,
  outcomeMessage,
  problemMessage,
  refusalMessage,
  updateReferenceLabel,
} from "./messages";
import type { Performed } from "./model/perform";
import { sampleNotebook } from "./model/fakeApi";

const sample = sampleNotebook();

const problems: Problem[] = [
  {
    kind: "duplicateRef",
    entity: "experiment",
    ref: "EXP-001",
    ids: ["a", "b"],
  },
  {
    kind: "duplicateId",
    entity: "question",
    id: "a",
    locations: ["Q-001.md", "Q-002.md"],
  },
  { kind: "folderRefMismatch", folder: "EXP-9", ref: "EXP-001", id: "a" },
  { kind: "orderNamesNoFile", entity: "experiment", id: "a" },
  { kind: "orderMisplaced", experiment: "a", listedUnder: "b" },
  { kind: "unreadable", path: "_notebook/questions/Q-009.md" },
];

const performed: Performed[] = [
  { kind: "done", loaded: { state: sample.state, hashes: {} } },
  { kind: "refused", error: { kind: "invalid", message: "x", field: "title" } },
  { kind: "notWritten", reason: "notWritable" },
  { kind: "notWritten", reason: "backupFailed" },
  { kind: "interrupted", reason: "changed", written: 0 },
  { kind: "interrupted", reason: "changed", written: 1 },
  { kind: "interrupted", reason: "failed", written: 0 },
  { kind: "interrupted", reason: "failed", written: 2 },
];

describe("messages", () => {
  it("says something about every problem, without showing a system path", () => {
    for (const problem of problems) {
      const text = problemMessage(problem);
      expect(text.length, problem.kind).toBeGreaterThan(20);
      expect(text).not.toMatch(/[A-Z]:\\|\/Users\/|_notebook|Error:/);
    }
  });

  it("names the refs involved in a duplicate", () => {
    expect(problemMessage(problems[0] as Problem)).toContain("EXP-001");
  });

  it("explains every outcome that is not a success, and is silent about a success", () => {
    for (const done of performed) {
      const text = outcomeMessage(done);
      if (done.kind === "done") expect(text).toBeNull();
      else expect(text?.length, JSON.stringify(done)).toBeGreaterThan(20);
    }
  });

  it("tells a partial failure apart from one that changed nothing", () => {
    const none = outcomeMessage({
      kind: "interrupted",
      reason: "failed",
      written: 0,
    });
    const some = outcomeMessage({
      kind: "interrupted",
      reason: "failed",
      written: 2,
    });
    expect(none).toContain("nothing was changed");
    expect(some).toContain("Some files were saved");
  });

  it("names the field a refused value was typed into", () => {
    const refusals: NotebookError[] = [
      { kind: "invalid", message: "m", field: "title" },
      { kind: "invalid", message: "m", field: "status" },
      { kind: "invalid", message: "m", field: "started" },
      { kind: "invalid", message: "m", field: "completed" },
      { kind: "invalid", message: "m", field: "text" },
      { kind: "invalid", message: "m" },
      { kind: "notFound", entity: "experiment", id: "a" },
    ];
    const texts = refusals.map(refusalMessage);
    expect(texts[0]).toContain("title");
    expect(texts[2]).toContain("YYYY-MM-DD");
    expect(texts[2]).toBe(texts[3]);
    expect(texts[4]).toContain("##");
    expect(new Set(texts).size).toBe(6);
  });

  it("explains a genuinely unexpected exception, which is not a perform() outcome", () => {
    const text = outcomeMessage({ kind: "unexpected" });
    expect(text).toBe(
      "Something unexpected happened. The list has been refreshed.",
    );
  });

  it("explains both ways loading can fail", () => {
    expect(loadFailureMessage("projectFile")).toContain("Nothing was changed");
    expect(loadFailureMessage("unavailable")).toContain("Nothing was changed");
  });

  it("names the section a static editor's activation control will open", () => {
    expect(editLabel("Methods")).toBe("Edit Methods");
    expect(editLabel("Results notes")).toBe("Edit Results notes");
  });

  it("labels every artefact type for the @ autocomplete (FR-EDT-04)", () => {
    expect(artefactTypeLabel("image")).toBe("Image");
    expect(artefactTypeLabel("pdf")).toBe("PDF");
    expect(artefactTypeLabel("svg")).toBe("SVG");
    expect(artefactTypeLabel("table")).toBe("Table");
    expect(artefactTypeLabel("script")).toBe("Script");
    expect(artefactTypeLabel("notebook")).toBe("Notebook");
    expect(artefactTypeLabel("text")).toBe("Text");
    expect(artefactTypeLabel("html")).toBe("HTML");
    expect(artefactTypeLabel("other")).toBe("Other");
  });

  it("labels a version as vN", () => {
    expect(artefactVersionLabel(2)).toBe("v2");
  });

  it("names the reference and the version an Update control moves it to (FR-EDT-07)", () => {
    expect(updateReferenceLabel("PCA by treatment", 2)).toBe(
      "Update PCA by treatment to v2",
    );
  });
});
