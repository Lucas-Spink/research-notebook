import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { expandedMessages } from "../messages";

/**
 * Read-only view of a passthrough block (FR-EDT-02): Markdown this editor
 * cannot represent — a table, raw HTML, a heading outside levels 3-4, or
 * any other construct nested alongside one — shown exactly as written and
 * never editable here.
 */
export function PassthroughBlock({ node }: ReactNodeViewProps) {
  const markdown =
    typeof node.attrs.markdown === "string" ? node.attrs.markdown : "";
  return (
    <NodeViewWrapper
      as="div"
      className="expanded__passthrough"
      contentEditable={false}
    >
      <p className="expanded__passthrough-label">
        {expandedMessages.passthroughLabel}
      </p>
      <pre className="expanded__passthrough-text">{markdown}</pre>
    </NodeViewWrapper>
  );
}
