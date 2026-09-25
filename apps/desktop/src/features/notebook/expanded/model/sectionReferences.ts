import type {
  ArtefactsFileModel,
  JSONContent,
} from "@research-notebook/format";
import { ARTEFACT_REF_NODE_NAME } from "@research-notebook/format";
import type { Editor } from "@tiptap/react";
import {
  newerVersionUpdate,
  readReferenceAttrs,
  resolveReference,
} from "./artefactReference";

/**
 * Whether `editor`'s document holds a reference whose artefact has a newer
 * version (FR-EDT-07): drives the "Update all in section" control's
 * visibility, from the live editor's own document, not a stale snapshot.
 */
export function sectionHasNewerVersions(
  editor: Editor,
  file: ArtefactsFileModel | null,
): boolean {
  if (file === null) return false;
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== ARTEFACT_REF_NODE_NAME) return;
    if (
      newerVersionUpdate(
        resolveReference(file, readReferenceAttrs(node.attrs)),
      ) !== null
    ) {
      found = true;
    }
  });
  return found;
}

/**
 * Updates every reference in `editor`'s document whose artefact has a newer
 * version to that version, in one transaction ("Update all in section",
 * FR-EDT-07). A single reference's own update runs directly through the
 * NodeView's `updateAttributes` (`ArtefactRefChipExtension.tsx`); this
 * covers a whole section the same way, so undo removes it in one step.
 */
export function updateAllReferences(
  editor: Editor,
  file: ArtefactsFileModel,
): void {
  editor.commands.command(({ tr, state }) => {
    let changed = false;
    state.doc.descendants((node, pos) => {
      if (node.type.name !== ARTEFACT_REF_NODE_NAME) return;
      const update = newerVersionUpdate(
        resolveReference(file, readReferenceAttrs(node.attrs)),
      );
      if (update === null) return;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...update });
      changed = true;
    });
    return changed;
  });
}

/** What `rewriteReferences` sets a resolved reference's label and target to,
 * or `null` when nothing should change: the reference is pending or
 * detached (FR-EDT-08: left exactly as last written), or it is link mode,
 * where only the label is rewritten (S4-T02's own scope limit — no code
 * here resolves a link-mode target to a real relative path yet). */
function currentLabelAndTarget(
  resolved: ReturnType<typeof resolveReference>,
): { label: string; target: string | null } | null {
  if (resolved.status !== "resolved") return null;
  if (resolved.artefact.mode !== "copy") {
    return { label: resolved.artefact.name, target: null };
  }
  const version = resolved.artefact.versions.find(
    (v) => v.v === resolved.version,
  );
  if (version === undefined) return null;
  return { label: resolved.artefact.name, target: version.file };
}

function rewriteNode(node: JSONContent, file: ArtefactsFileModel): JSONContent {
  if (node.type === ARTEFACT_REF_NODE_NAME) {
    const attrs = readReferenceAttrs(node.attrs);
    const current = currentLabelAndTarget(resolveReference(file, attrs));
    if (current === null) return node;
    return {
      ...node,
      attrs: {
        ...node.attrs,
        label: current.label,
        // `...node.attrs` above already carries the existing target over;
        // this only replaces it when there is a new one to set (copy mode).
        ...(current.target === null ? {} : { target: current.target }),
      },
    };
  }
  if (node.content === undefined) return node;
  return {
    ...node,
    content: node.content.map((child) => rewriteNode(child, file)),
  };
}

/**
 * Rewrites every reference's label and, for a copy-mode artefact, its
 * target, to current metadata (FR-EDT-09): applied automatically on every
 * save, not offered as a user action the way FR-EDT-07's version update is,
 * since a display name or file path is not a choice the person needs to
 * confirm. A pure transform of the section's Tiptap JSON, not a transaction
 * on a live editor's own document (`updateAllReferences`'s approach), so it
 * can run on the plain JSON `RichSectionEditor` is about to serialise
 * without touching editor state or undo history.
 */
export function rewriteReferences(
  doc: JSONContent,
  file: ArtefactsFileModel,
): JSONContent {
  return rewriteNode(doc, file);
}
