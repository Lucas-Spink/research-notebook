import type { ArtefactModel } from "@research-notebook/format";
import { assertNever } from "../../../shared/assertNever";

type Props = { type: ArtefactModel["type"] };

/** The page outline every type icon shares, with `children` as the glyph inside it. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="artefact-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 1.5h6l3 3v10a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      {children}
    </svg>
  );
}

/**
 * A small, decorative type icon (FR-EDT-04): distinguished by shape, not
 * colour alone, and paired with a text type label wherever it appears (see
 * `artefactTypeLabel` in `../messages`) so the type is never conveyed by the
 * icon alone.
 */
export function ArtefactTypeIcon({ type }: Props) {
  switch (type) {
    case "image":
      return (
        <Page>
          <circle cx="6" cy="8.5" r="1" fill="currentColor" />
          <path
            d="M4 12.5l2.5-3 2 2 1.5-2 2 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </Page>
      );
    case "pdf":
    case "text":
      return (
        <Page>
          <path
            d="M5 8h6M5 10.5h6M5 13h4"
            stroke="currentColor"
            strokeWidth="1"
          />
        </Page>
      );
    case "svg":
      return (
        <Page>
          <path
            d="M8 7l2.5 4.5h-5L8 7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </Page>
      );
    case "table":
      return (
        <Page>
          <path
            d="M4.5 7.5h7M4.5 10.5h7M7 7.5v6M10 7.5v6"
            stroke="currentColor"
            strokeWidth="1"
          />
        </Page>
      );
    case "script":
      return (
        <Page>
          <path
            d="M6 8l-1.5 2L6 12M10 8l1.5 2L10 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </Page>
      );
    case "notebook":
      return (
        <Page>
          <circle cx="5.5" cy="8" r="0.6" fill="currentColor" />
          <circle cx="5.5" cy="10.5" r="0.6" fill="currentColor" />
          <circle cx="5.5" cy="13" r="0.6" fill="currentColor" />
          <path
            d="M7.5 8h3M7.5 10.5h3M7.5 13h3"
            stroke="currentColor"
            strokeWidth="1"
          />
        </Page>
      );
    case "html":
      return (
        <Page>
          <path
            d="M6.5 8l-2 2 2 2M9.5 8l2 2-2 2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </Page>
      );
    case "other":
      return (
        <Page>
          <path
            d="M8 10.5v-.6c0-.6.4-.8.8-1.1.5-.3.7-.6.7-1 0-.6-.6-1-1.4-1-.6 0-1.1.3-1.4.7M8 12.4h.01"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </Page>
      );
    default:
      return assertNever(type);
  }
}
