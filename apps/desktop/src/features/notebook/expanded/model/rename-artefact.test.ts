import type { ArtefactsFileModel } from "@research-notebook/format";
import {
  ARTEFACT_REF_NODE_NAME,
  parseSectionMarkdown,
  serialiseSectionMarkdown,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { rewriteReferences } from "./sectionReferences";

/**
 * S4-G03 (`pnpm test:unit -- rename-artefact`): "All labels updated in
 * files; IDs and versions unchanged." There is no dedicated "rename
 * artefact" command in the application yet (only groups can be renamed,
 * S3-T08); the effect a rename would have on a stored reference is the
 * same as any other change to an artefact's current name in
 * `artefacts.yaml`, which `rewriteReferences` (FR-EDT-09) already covers.
 * This proves that specific scenario end to end, from stored Markdown text
 * through the rewrite back to stored Markdown text.
 */

const ULID = "01JB0000000000000000000001";

function artefactsAfterRename(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: ULID,
        name: "PCA by treatment (renamed)",
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
        ],
      },
    ],
    groups: [],
  };
}

describe("a rename is reflected in every reference to that artefact on save (S4-G03)", () => {
  it("updates the stored label to the artefact's new name, leaving its ULID and pinned version unchanged", () => {
    const before = `A note about [PCA by treatment](evidence/pca.v1.pdf "art:${ULID} v1"), see also [PCA by treatment](evidence/pca.v1.pdf "art:${ULID} v1") again.`;
    const doc = parseSectionMarkdown(before);
    const rewritten = rewriteReferences(doc, artefactsAfterRename());
    const after = serialiseSectionMarkdown(rewritten);

    expect(after).toBe(
      `A note about [PCA by treatment (renamed)](evidence/pca.v1.pdf "art:${ULID} v1"), see also [PCA by treatment (renamed)](evidence/pca.v1.pdf "art:${ULID} v1") again.`,
    );

    const refs = (rewritten.content ?? [])
      .flatMap((node) => node.content ?? [])
      .filter((node) => node.type === ARTEFACT_REF_NODE_NAME);
    expect(refs).toHaveLength(2);
    for (const ref of refs) {
      expect(ref.attrs?.ulid).toBe(ULID);
      expect(ref.attrs?.version).toBe(1);
    }
  });
});
