import type { AnyExtension } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  ARTEFACT_REF_NODE_NAME,
  PASSTHROUGH_NODE_NAME,
  Passthrough,
  sectionEditorExtensions,
} from "@research-notebook/format";
import { artefactRefChip, type ChipOptions } from "./ArtefactRefChipExtension";
import { artefactSuggestion } from "./ArtefactSuggestion";
import type { ArtefactSearchRow } from "./model/artefactSearch";
import { PassthroughBlock } from "./PassthroughBlock";

/**
 * The live editor's extensions: `packages/format`'s shared schema
 * (AGENTS.md 2.2, one parser), with a read-only view attached to the
 * passthrough node (FR-EDT-02), the reference chip (FR-EDT-06, S4-T03) and
 * the @ autocomplete (FR-EDT-04, S4-T02) added on top. Parsing and
 * serialising stay entirely in packages/format.
 */
export function liveEditorExtensions(
  search: (query: string) => ArtefactSearchRow[],
  chip: ChipOptions,
): AnyExtension[] {
  return [
    ...sectionEditorExtensions().map((extension) => {
      if (extension.name === PASSTHROUGH_NODE_NAME) {
        return Passthrough.extend({
          addNodeView: () => ReactNodeViewRenderer(PassthroughBlock),
        });
      }
      if (extension.name === ARTEFACT_REF_NODE_NAME) {
        return artefactRefChip(chip);
      }
      return extension;
    }),
    artefactSuggestion({ search }),
  ];
}
