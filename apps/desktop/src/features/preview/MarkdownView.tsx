import { createElement, type ReactNode } from "react";
import { assertNever } from "../../shared/assertNever";
import { previewMessages as m } from "./messages";
import type { Block, Inline } from "./model/markdown";

function InlineView({ inline }: { inline: Inline }): ReactNode {
  switch (inline.kind) {
    case "text":
      return inline.text;
    case "code":
      return <code>{inline.text}</code>;
    case "strong":
      return (
        <strong>
          <InlineList content={inline.content} />
        </strong>
      );
    case "emphasis":
      return (
        <em>
          <InlineList content={inline.content} />
        </em>
      );
    case "link":
      // Shown as a link but not one: a notebook's link is never followed, so
      // nothing is loaded and no address is opened from here.
      return (
        <span className="md__link" title={m.cells.link(inline.href)}>
          <InlineList content={inline.content} />
        </span>
      );
    case "image":
      return <span className="md__image">{m.cells.image_alt(inline.alt)}</span>;
    default:
      return assertNever(inline);
  }
}

function InlineList({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((inline, i) => (
        <InlineView key={i} inline={inline} />
      ))}
    </>
  );
}

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.kind) {
    case "heading":
      // Below the panel's own headings, and no deeper than h6.
      return createElement(
        `h${Math.min(6, block.level + 2)}`,
        { className: "md__heading" },
        <InlineList content={block.content} />,
      );
    case "paragraph":
      return (
        <p>
          <InlineList content={block.content} />
        </p>
      );
    case "quote":
      return (
        <blockquote>
          <InlineList content={block.content} />
        </blockquote>
      );
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i}>
          <InlineList content={item} />
        </li>
      ));
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case "code":
      return (
        <pre className="md__code">
          <code>{block.text}</code>
        </pre>
      );
    case "rule":
      return <hr />;
    default:
      return assertNever(block);
  }
}

/**
 * A notebook cell's Markdown, drawn from the tree `parseMarkdown` makes.
 * Every node is a React element or text, so nothing in the source can inject
 * markup, load a resource or run script.
 */
export function MarkdownView({ blocks }: { blocks: Block[] }) {
  return (
    <div className="md">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}
