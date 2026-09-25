import type { ArtefactsFileModel } from "@research-notebook/format";
import {
  parseSectionMarkdown,
  sectionEditorExtensions,
  serialiseSectionMarkdown,
} from "@research-notebook/format";
import { Editor } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import {
  sectionHasNewerVersions,
  updateAllReferences,
} from "./sectionReferences";

const ULID = "01JB0000000000000000000001";
const ULID2 = "01JB0000000000000000000002";

/** Two copy-mode artefacts, each with a v1 and a newer v2 (FR-EDT-07). */
function artefacts(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: ULID,
        name: "PCA by treatment",
        role: "result",
        mode: "copy",
        type: "pdf",
        source: { root: "project", path: "scripts/pca.R" },
        created: "2026-01-01T00:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/pca.v1.pdf",
            sha256: "a".repeat(64),
            size: 10,
            captured: "2026-01-01T00:00:00Z",
          },
          {
            v: 2,
            file: "evidence/pca.v2.pdf",
            sha256: "b".repeat(64),
            size: 20,
            captured: "2026-01-02T00:00:00Z",
          },
        ],
      },
      {
        id: ULID2,
        name: "Raw counts",
        role: "result",
        mode: "copy",
        type: "table",
        source: { root: "project", path: "scripts/counts.R" },
        created: "2026-01-01T00:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/counts.v1.csv",
            sha256: "c".repeat(64),
            size: 10,
            captured: "2026-01-01T00:00:00Z",
          },
          {
            v: 2,
            file: "evidence/counts.v2.csv",
            sha256: "d".repeat(64),
            size: 20,
            captured: "2026-01-02T00:00:00Z",
          },
        ],
      },
    ],
    groups: [],
  };
}

function editorFor(markdown: string): Editor {
  return new Editor({
    extensions: sectionEditorExtensions(),
    content: parseSectionMarkdown(markdown),
  });
}

describe("sectionHasNewerVersions", () => {
  it("is false while the experiment's artefacts have not loaded", () => {
    const editor = editorFor(`[Stale](evidence/pca.v1.pdf "art:${ULID} v1")`);
    expect(sectionHasNewerVersions(editor, null)).toBe(false);
  });

  it("is false when every reference is pinned to its artefact's latest version", () => {
    const editor = editorFor(`[Current](evidence/pca.v2.pdf "art:${ULID} v2")`);
    expect(sectionHasNewerVersions(editor, artefacts())).toBe(false);
  });

  it("is true when a reference is pinned to an older version than its artefact now has (FR-EDT-07)", () => {
    const editor = editorFor(`[Stale](evidence/pca.v1.pdf "art:${ULID} v1")`);
    expect(sectionHasNewerVersions(editor, artefacts())).toBe(true);
  });
});

describe("updateAllReferences", () => {
  it("updates every outdated reference to its artefact's latest version and current name, leaving an already-current one exactly as written", () => {
    const editor = editorFor(
      `[Stale PCA](evidence/pca.v1.pdf "art:${ULID} v1") and [Current counts](evidence/counts.v2.csv "art:${ULID2} v2")`,
    );
    updateAllReferences(editor, artefacts());
    expect(sectionHasNewerVersions(editor, artefacts())).toBe(false);
    const text = serialiseSectionMarkdown(editor.getJSON());
    expect(text).toContain(
      `[PCA by treatment](evidence/pca.v2.pdf "art:${ULID} v2")`,
    );
    // Already pinned to the latest version: untouched, including its
    // hand-typed label (relabelling everything on save is FR-EDT-09, a
    // later task).
    expect(text).toContain(
      `[Current counts](evidence/counts.v2.csv "art:${ULID2} v2")`,
    );
  });

  it("leaves the document unchanged when nothing is outdated", () => {
    const editor = editorFor(`[Current](evidence/pca.v2.pdf "art:${ULID} v2")`);
    const before = serialiseSectionMarkdown(editor.getJSON());
    updateAllReferences(editor, artefacts());
    expect(serialiseSectionMarkdown(editor.getJSON())).toBe(before);
  });
});
