import type { JSONContent } from "@research-notebook/format";
import {
  ARTEFACT_REF_NODE_NAME,
  PASSTHROUGH_NODE_NAME,
} from "@research-notebook/format";
import { Fragment } from "react";
import { expandedMessages } from "../messages";

/**
 * A read-only rendering of a section's parsed content, used for the two
 * sections that are not the live editor (FR-EDT-03: at most one editor
 * instance is mounted at a time). Built directly from the same
 * `packages/format` schema the live editor uses, not a second Tiptap/
 * ProseMirror instance.
 */
export function StaticSectionContent({ doc }: { doc: JSONContent }) {
  return <div className="expanded__static">{renderNodes(doc.content)}</div>;
}

function renderNodes(nodes: JSONContent[] | undefined) {
  return (nodes ?? []).map((node, index) => (
    <Fragment key={index}>{renderNode(node)}</Fragment>
  ));
}

function renderNode(node: JSONContent) {
  switch (node.type) {
    case "paragraph":
      return <p>{renderNodes(node.content)}</p>;
    case "heading": {
      const Tag = node.attrs?.level === 4 ? "h4" : "h3";
      return <Tag>{renderNodes(node.content)}</Tag>;
    }
    case "blockquote":
      return <blockquote>{renderNodes(node.content)}</blockquote>;
    case "bulletList":
      return <ul>{renderNodes(node.content)}</ul>;
    case "orderedList":
      return <ol>{renderNodes(node.content)}</ol>;
    case "listItem":
      return <li>{renderNodes(node.content)}</li>;
    case "codeBlock":
      return (
        <pre>
          <code>{renderNodes(node.content)}</code>
        </pre>
      );
    case ARTEFACT_REF_NODE_NAME:
      // Plain fallback (FR-EDT-04/05 only); chip styling and hover/focus
      // detail are S4-T03 (FR-EDT-06).
      return (
        <span className="expanded__artefact-ref">
          {typeof node.attrs?.label === "string" ? node.attrs.label : ""}
        </span>
      );
    case PASSTHROUGH_NODE_NAME:
      return (
        <div className="expanded__passthrough">
          <p className="expanded__passthrough-label">
            {expandedMessages.passthroughLabel}
          </p>
          <pre className="expanded__passthrough-text">
            {typeof node.attrs?.markdown === "string"
              ? node.attrs.markdown
              : ""}
          </pre>
        </div>
      );
    case "text":
      return renderText(node);
    case undefined:
    default:
      return null;
  }
}

function renderText(node: JSONContent) {
  const text = node.text ?? "";
  const marks = node.marks ?? [];
  return marks.reduce<React.ReactNode>((content, mark) => {
    switch (mark.type) {
      case "bold":
        return <strong>{content}</strong>;
      case "italic":
        return <em>{content}</em>;
      case "code":
        return <code>{content}</code>;
      case "link":
        return (
          <a href={typeof mark.attrs?.href === "string" ? mark.attrs.href : ""}>
            {content}
          </a>
        );
      default:
        return content;
    }
  }, text);
}
