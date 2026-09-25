import type { AnyExtension } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  PASSTHROUGH_NODE_NAME,
  Passthrough,
  sectionEditorExtensions,
} from "@research-notebook/format";
import { artefactSuggestion } from "./ArtefactSuggestion";
import type { ArtefactSearchRow } from "./model/artefactSearch";
import { PassthroughBlock } from "./PassthroughBlock";

/**
 * The live editor's extensions: `packages/format`'s shared schema
 * (AGENTS.md 2.2, one parser), with a read-only view attached to the
 * passthrough node (FR-EDT-02) and the @ autocomplete (FR-EDT-04, S4-T02)
 * added on top. Parsing and serialising stay entirely in packages/format.
 */
export function liveEditorExtensions(
  search: (query: string) => ArtefactSearchRow[],
): AnyExtension[] {
  return [
    ...sectionEditorExtensions().map((extension) =>
      extension.name === PASSTHROUGH_NODE_NAME
        ? Passthrough.extend({
            addNodeView: () => ReactNodeViewRenderer(PassthroughBlock),
          })
        : extension,
    ),
    artefactSuggestion({ search }),
  ];
}
