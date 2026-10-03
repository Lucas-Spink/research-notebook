import type {
  ArtefactsFileModel,
  JSONContent,
} from "@research-notebook/format";
import {
  ARTEFACT_REF_NODE_NAME,
  CITATION_IN_TEXT_NODE_NAME,
  CITATION_NODE_NAME,
  PASSTHROUGH_NODE_NAME,
  type CitationItem,
} from "@research-notebook/format";
import { Fragment } from "react";
import { CitationSource, sourceStatusText, useSources } from "../../citations";
import { expandedMessages } from "../messages";
import { ArtefactRefChip } from "./ArtefactRefChip";
import {
  readReferenceAttrs,
  resolveReference,
} from "./model/artefactReference";

type Props = {
  doc: JSONContent;
  /** The experiment's artefacts, for a reference's current name and pinned
   * version (FR-EDT-06); `null` while unavailable. */
  artefacts: ArtefactsFileModel | null;
  /** Opens a reference's pinned version's preview. */
  onActivateReference: (ulid: string, version: number | null) => void;
};

/** What every node renderer needs beyond the node itself. */
type Context = Pick<Props, "artefacts" | "onActivateReference">;

/**
 * A read-only rendering of a section's parsed content, used for the two
 * sections that are not the live editor (FR-EDT-03: at most one editor
 * instance is mounted at a time). Built directly from the same
 * `packages/format` schema the live editor uses, not a second Tiptap/
 * ProseMirror instance.
 */
export function StaticSectionContent({
  doc,
  artefacts,
  onActivateReference,
}: Props) {
  const ctx: Context = { artefacts, onActivateReference };
  return (
    <div className="expanded__static">{renderNodes(doc.content, ctx)}</div>
  );
}

function renderNodes(nodes: JSONContent[] | undefined, ctx: Context) {
  return (nodes ?? []).map((node, index) => (
    <Fragment key={index}>{renderNode(node, ctx)}</Fragment>
  ));
}

function renderNode(node: JSONContent, ctx: Context) {
  switch (node.type) {
    case "paragraph":
      return <p>{renderNodes(node.content, ctx)}</p>;
    case "heading": {
      const Tag = node.attrs?.level === 4 ? "h4" : "h3";
      return <Tag>{renderNodes(node.content, ctx)}</Tag>;
    }
    case "blockquote":
      return <blockquote>{renderNodes(node.content, ctx)}</blockquote>;
    case "bulletList":
      return <ul>{renderNodes(node.content, ctx)}</ul>;
    case "orderedList":
      return <ol>{renderNodes(node.content, ctx)}</ol>;
    case "listItem":
      return <li>{renderNodes(node.content, ctx)}</li>;
    case "codeBlock":
      return (
        <pre>
          <code>{renderNodes(node.content, ctx)}</code>
        </pre>
      );
    case ARTEFACT_REF_NODE_NAME: {
      const attrs = readReferenceAttrs(node.attrs);
      const resolved = resolveReference(ctx.artefacts, attrs);
      const { ulid, version } = attrs;
      return (
        <ArtefactRefChip
          resolved={resolved}
          onActivate={
            ulid === null
              ? undefined
              : () => ctx.onActivateReference(ulid, version)
          }
          // A static section is not the live editor, so its content cannot
          // change here (FR-EDT-03): the "newer version" mark still shows
          // (ArtefactRefChip computes it from `resolved`), but the Update
          // control only appears once this section is activated into the
          // live editor (ArtefactRefChipExtension.tsx).
          onUpdate={undefined}
        />
      );
    }
    case CITATION_NODE_NAME: {
      const items = Array.isArray(node.attrs?.items)
        ? (node.attrs.items as CitationItem[])
        : [];
      return <StaticCitation citekeys={items.map((item) => item.citekey)} />;
    }
    case CITATION_IN_TEXT_NODE_NAME: {
      const citekey =
        typeof node.attrs?.citekey === "string" ? node.attrs.citekey : "";
      const locator =
        typeof node.attrs?.locator === "string" ? node.attrs.locator : null;
      return <StaticInTextCitation citekey={citekey} locator={locator} />;
    }
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

type SourceText = {
  citekey: string;
  text: string;
  state: string | null;
  known: boolean;
};

/** What a citation shows for one source: its cached label, else the citekey. */
function useSourceText(citekey: string): SourceText {
  const view = useSources().lookup(citekey);
  if (view === null) {
    return { citekey, text: `@${citekey}`, state: null, known: false };
  }
  return {
    citekey,
    text: view.label,
    state: view.status === "ok" ? null : sourceStatusText(view.status),
    known: true,
  };
}

/**
 * A cited source's label. A source the bibliography holds opens its details
 * (FR-CIT-04); one it does not has nothing to open, so stays plain text.
 */
function SourceLabel({ source }: { source: SourceText }) {
  const { select } = useSources();
  if (!source.known) return <>{source.text}</>;
  return (
    <CitationSource
      citekey={source.citekey}
      onActivate={() => select(source.citekey)}
    />
  );
}

function StaticCitation({ citekeys }: { citekeys: string[] }) {
  const { lookup } = useSources();
  const sources = citekeys.map((citekey): SourceText => {
    const view = lookup(citekey);
    return view === null
      ? { citekey, text: `@${citekey}`, state: null, known: false }
      : {
          citekey,
          text: view.label,
          state: view.status === "ok" ? null : sourceStatusText(view.status),
          known: true,
        };
  });
  const states = sources.flatMap(({ state }) =>
    state === null ? [] : [state],
  );
  return (
    <span className="expanded__citation">
      [
      {sources.map((source, index) => (
        <Fragment key={source.citekey}>
          {index > 0 && "; "}
          <SourceLabel source={source} />
        </Fragment>
      ))}
      ]
      {states.length > 0 && (
        <span className="expanded__citation-state">
          {" "}
          ({[...new Set(states)].join("; ")})
        </span>
      )}
    </span>
  );
}

function StaticInTextCitation({
  citekey,
  locator,
}: {
  citekey: string;
  locator: string | null;
}) {
  const source = useSourceText(citekey);
  return (
    <span className="expanded__citation-in-text">
      <SourceLabel source={source} />
      {locator === null ? "" : ` [${locator}]`}
      {source.state !== null && (
        <span className="expanded__citation-state"> ({source.state})</span>
      )}
    </span>
  );
}
