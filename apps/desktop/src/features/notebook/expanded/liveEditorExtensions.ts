import type { AnyExtension } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  PASSTHROUGH_NODE_NAME,
  Passthrough,
  sectionEditorExtensions,
} from "@research-notebook/format";
import { PassthroughBlock } from "./PassthroughBlock";

/**
 * The live editor's extensions: `packages/format`'s shared schema
 * (AGENTS.md 2.2, one parser), with a read-only view attached to the
 * passthrough node (FR-EDT-02). This only changes how a passthrough block
 * is displayed; parsing and serialising stay entirely in packages/format.
 */
export function liveEditorExtensions(): AnyExtension[] {
  return sectionEditorExtensions().map((extension) =>
    extension.name === PASSTHROUGH_NODE_NAME
      ? Passthrough.extend({
          addNodeView: () => ReactNodeViewRenderer(PassthroughBlock),
        })
      : extension,
  );
}
