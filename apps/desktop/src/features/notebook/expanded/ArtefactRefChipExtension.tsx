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
  newerVersionUpdate,
  readReferenceAttrs,
  resolveReference,
} from "./model/artefactReference";

export type ChipOptions = {
  /** The experiment's artefacts, read at render time so a NodeView built
   * once still sees later updates (FR-EDT-06's "current" name). */
  resolve: () => ArtefactsFileModel | null;
  /** Opens the pinned version's preview. */
  onActivate: (ulid: string, version: number | null) => void;
  /** Whether the document may be changed right now. Read at click time, not
   * baked into the extension, so a project going read-only mid-session
   * (`disabled` changing without the editor itself being rebuilt) still
   * blocks Update (FR-EDT-07) the same way it already blocks typing. */
  canUpdate: () => boolean;
};

function View({
  node,
  resolve,
  onActivate,
  canUpdate,
  updateAttributes,
}: ReactNodeViewProps & ChipOptions) {
  const attrs = readReferenceAttrs(node.attrs);
  const resolved = resolveReference(resolve(), attrs);
  const { ulid, version } = attrs;
  const update = newerVersionUpdate(resolved);
  return (
    <NodeViewWrapper as="span" contentEditable={false}>
      <ArtefactRefChip
        resolved={resolved}
        onActivate={ulid === null ? undefined : () => onActivate(ulid, version)}
        onUpdate={
          update === null || !canUpdate()
            ? undefined
            : () => updateAttributes(update)
        }
      />
    </NodeViewWrapper>
  );
}

/**
 * Attaches the reference chip's rendering to `ArtefactRef` (FR-EDT-06) for
 * the live editor. `packages/format`'s node stays a plain schema
 * definition (AGENTS.md 4: no React there); the NodeView lives here, in the
 * webview, the same way `Passthrough` gets one in `liveEditorExtensions.ts`.
 * A closure over `resolve`/`onActivate`/`canUpdate`, not Tiptap's
 * `addOptions`, so reading them back in `View` needs no `as` cast on the
 * generic `Node` Tiptap's `NodeViewRendererProps.extension` type carries.
 */
export function artefactRefChip({
  resolve,
  onActivate,
  canUpdate,
}: ChipOptions): AnyExtension {
  function BoundView(props: ReactNodeViewProps) {
    return (
      <View
        {...props}
        resolve={resolve}
        onActivate={onActivate}
        canUpdate={canUpdate}
      />
    );
  }
  return ArtefactRef.extend({
    addNodeView() {
      return ReactNodeViewRenderer(BoundView);
    },
  });
}
