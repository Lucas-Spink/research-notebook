import type { ArtefactsFileModel } from "@research-notebook/format";
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
