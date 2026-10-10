import type { ArtefactModel } from "@research-notebook/format";
import type { ReactNode } from "react";
import { Page } from "./ArtefactTypeIcon";

/** The kinds of file the Results tree tells apart at a glance. */
export type FileKind =
  | "image"
  | "vector"
  | "pdf"
  | "table"
  | "python"
  | "rcode"
  | "notebook"
  | "html"
  | "json"
  | "text"
  | "generic";

const BY_EXTENSION: Readonly<Record<string, FileKind>> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  svg: "vector",
  pdf: "pdf",
  csv: "table",
  tsv: "table",
  xlsx: "table",
  py: "python",
  r: "rcode",
  rmd: "rcode",
  ipynb: "notebook",
  html: "html",
  htm: "html",
  json: "json",
  txt: "text",
  md: "text",
};

const BY_TYPE: Readonly<Record<ArtefactModel["type"], FileKind>> = {
  image: "image",
  svg: "vector",
  pdf: "pdf",
  table: "table",
  script: "python",
  notebook: "notebook",
  text: "text",
  html: "html",
  other: "generic",
};

/** Muted, consistent colours; a kind is also told apart by its glyph, never by colour alone. */
const COLOURS: Readonly<Record<FileKind, string>> = {
  image: "#a855f7",
  vector: "#a855f7",
  pdf: "#dc2626",
  table: "#16a34a",
  python: "#3b82f6",
  rcode: "#2563eb",
  notebook: "#ea580c",
  html: "#ea580c",
  json: "#ca8a04",
  text: "#64748b",
  generic: "#64748b",
};

/** The kind of a file from its extension, else from its recorded type. */
export function fileKindOf(
  name: string,
  type: ArtefactModel["type"],
): FileKind {
  const dot = name.lastIndexOf(".");
  const extension = dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
  return BY_EXTENSION[extension] ?? BY_TYPE[type];
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1,
} as const;

function glyph(kind: FileKind): ReactNode {
  switch (kind) {
    case "image":
      return (
        <>
          <circle cx="6" cy="8.5" r="1" fill="currentColor" />
          <path d="M4 12.5l2.5-3 2 2 1.5-2 2 3" {...stroke} />
        </>
      );
    case "vector":
      return <path d="M8 7l2.5 4.5h-5L8 7Z" {...stroke} />;
    case "pdf":
      return <path d="M5 8h6M5 10.5h6M5 13h4" stroke="currentColor" />;
    case "table":
      return (
        <path
          d="M4.5 7.5h7M4.5 10.5h7M7 7.5v6M10 7.5v6"
          stroke="currentColor"
        />
      );
    case "python":
    case "rcode":
      return <path d="M6 8l-1.5 2L6 12M10 8l1.5 2L10 12" {...stroke} />;
    case "notebook":
      return (
        <>
          <circle cx="5.5" cy="8" r="0.6" fill="currentColor" />
          <circle cx="5.5" cy="10.5" r="0.6" fill="currentColor" />
          <circle cx="5.5" cy="13" r="0.6" fill="currentColor" />
          <path d="M7.5 8h3M7.5 10.5h3M7.5 13h3" stroke="currentColor" />
        </>
      );
    case "html":
      return <path d="M6.5 8l-2 2 2 2M9.5 8l2 2-2 2" {...stroke} />;
    case "json":
      return (
        <path
          d="M6.5 7.5c-1 0-1 .6-1 1.4s0 1.1-.8 1.1c.8 0 .8.3.8 1.1s0 1.4 1 1.4M9.5 7.5c1 0 1 .6 1 1.4s0 1.1.8 1.1c-.8 0-.8.3-.8 1.1s0 1.4-1 1.4"
          {...stroke}
        />
      );
    case "text":
      return <path d="M5 8h6M5 10.5h6M5 13h4" stroke="currentColor" />;
    case "generic":
      return null;
  }
}

/**
 * A small file icon for the Results tree, chosen by extension and coloured
 * by kind. It is decorative: the name beside it says what the file is.
 */
export function FileIcon({
  name,
  type,
}: {
  name: string;
  type: ArtefactModel["type"];
}) {
  const kind = fileKindOf(name, type);
  return (
    <span
      className="file-icon"
      data-kind={kind}
      style={{ color: COLOURS[kind] }}
    >
      <Page>{glyph(kind)}</Page>
    </span>
  );
}

/** The gold used for every virtual folder. */
export const FOLDER_COLOUR = "#d9a441";

/** A small yellow folder, open when its contents are showing. */
export function GroupFolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="folder-icon"
      data-open={open}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      style={{ color: FOLDER_COLOUR }}
    >
      {open ? (
        <>
          <path
            d="M1.5 3.5a.5.5 0 0 1 .5-.5h3.6l1.4 1.5H13a.5.5 0 0 1 .5.5V6H3.2L1.5 12.5V3.5Z"
            fill="currentColor"
            fillOpacity="0.55"
          />
          <path
            d="M3.2 6.5h11.6a.5.5 0 0 1 .48.64l-1.6 6a.5.5 0 0 1-.48.36H2.5a.5.5 0 0 1-.48-.64l1.2-6a.5.5 0 0 1 .48-.36Z"
            fill="currentColor"
          />
        </>
      ) : (
        <path
          d="M1.5 3.5a.5.5 0 0 1 .5-.5h3.6l1.4 1.5H14a.5.5 0 0 1 .5.5v7.5a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5v-9Z"
          fill="currentColor"
        />
      )}
    </svg>
  );
}
