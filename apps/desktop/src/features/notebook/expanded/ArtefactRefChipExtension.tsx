import {
  ArtefactRef,
  type ArtefactsFileModel,
} from "@research-notebook/format";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type AnyExtension,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { ArtefactRefChip } from "./ArtefactRefChip";
import {
  readReferenceAttrs,
  resolveReference,
} from "./model/artefactReference";

export type ChipOptions = {
  /** The experiment's artefacts, read at render time so a NodeView built
   * once still sees later updates (FR-EDT-06's "current" name). */
  resolve: () => ArtefactsFileModel | null;
  /** Opens the pinned version's preview. */
  onActivate: (ulid: string, version: number | null) => void;
};

function View({ node, resolve, onActivate }: ReactNodeViewProps & ChipOptions) {
  const attrs = readReferenceAttrs(node.attrs);
  const resolved = resolveReference(resolve(), attrs);
  const { ulid, version } = attrs;
  return (
    <NodeViewWrapper as="span" contentEditable={false}>
      <ArtefactRefChip
        resolved={resolved}
        onActivate={ulid === null ? undefined : () => onActivate(ulid, version)}
      />
    </NodeViewWrapper>
  );
}

/**
 * Attaches the reference chip's rendering to `ArtefactRef` (FR-EDT-06) for
 * the live editor. `packages/format`'s node stays a plain schema
 * definition (AGENTS.md 4: no React there); the NodeView lives here, in the
 * webview, the same way `Passthrough` gets one in `liveEditorExtensions.ts`.
 * A closure over `resolve`/`onActivate`, not Tiptap's `addOptions`, so
 * reading them back in `View` needs no `as` cast on the generic `Node`
 * Tiptap's `NodeViewRendererProps.extension` type carries.
 */
export function artefactRefChip({
  resolve,
  onActivate,
}: ChipOptions): AnyExtension {
  function BoundView(props: ReactNodeViewProps) {
    return <View {...props} resolve={resolve} onActivate={onActivate} />;
  }
  return ArtefactRef.extend({
    addNodeView() {
      return ReactNodeViewRenderer(BoundView);
    },
  });
}
