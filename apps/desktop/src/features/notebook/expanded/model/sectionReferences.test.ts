import type { ArtefactsFileModel } from "@research-notebook/format";
import {
  parseSectionMarkdown,
  sectionEditorExtensions,
  serialiseSectionMarkdown,
} from "@research-notebook/format";
import { Editor } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import {
  rewriteReferences,
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
    // hand-typed label (relabelling everything on save is `rewriteReferences`,
    // below, run separately and unconditionally on every save — FR-EDT-09).
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

const LINK_ULID = "01JB0000000000000000000003";
const DETACHED_ULID = "01JB0000000000000000000099";

/** Adds a link-mode artefact to `artefacts()`, for `rewriteReferences`'s
 * label-only reach into link mode (S4-T02's own scope limit on a link-mode
 * target still applies here). */
function artefactsWithLink(): ArtefactsFileModel {
  const file = artefacts();
  return {
    ...file,
    artefacts: [
      ...file.artefacts,
      {
        id: LINK_ULID,
        name: "Raw counts",
        role: "result",
        mode: "link",
        type: "table",
        source: { root: "project", path: "data/counts.h5" },
        created: "2026-01-01T00:00:00Z",
        link: {
          sha256: "e".repeat(64),
          size: 100,
          observed_mtime: "2026-01-01T00:00:00Z",
          checked: "2026-01-01T00:00:00Z",
        },
      },
    ],
  };
}

describe("rewriteReferences (FR-EDT-09)", () => {
  it("rewrites a copy-mode reference's label and target to its artefact's current name and pinned version's file, leaving the ULID and version unchanged", () => {
    const doc = parseSectionMarkdown(
      `[Old name](evidence/old-path.pdf "art:${ULID} v1")`,
    );
    const rewritten = rewriteReferences(doc, artefacts());
    expect(serialiseSectionMarkdown(rewritten)).toBe(
      `[PCA by treatment](evidence/pca.v1.pdf "art:${ULID} v1")`,
    );
  });

  it("rewrites a link-mode reference's label only, leaving its target as previously written", () => {
    const doc = parseSectionMarkdown(
      `[Old name](../../../data/counts.h5 "art:${LINK_ULID}")`,
    );
    const rewritten = rewriteReferences(doc, artefactsWithLink());
    expect(serialiseSectionMarkdown(rewritten)).toBe(
      `[Raw counts](../../../data/counts.h5 "art:${LINK_ULID}")`,
    );
  });

  it("leaves a detached reference untouched (FR-EDT-08)", () => {
    const text = `[Removed artefact](evidence/gone.v1.pdf "art:${DETACHED_ULID} v1")`;
    const doc = parseSectionMarkdown(text);
    const rewritten = rewriteReferences(doc, artefacts());
    expect(serialiseSectionMarkdown(rewritten)).toBe(text);
  });

  it("leaves an already-current reference unchanged", () => {
    const text = `[PCA by treatment](evidence/pca.v1.pdf "art:${ULID} v1")`;
    const doc = parseSectionMarkdown(text);
    const rewritten = rewriteReferences(doc, artefacts());
    expect(serialiseSectionMarkdown(rewritten)).toBe(text);
  });
});
