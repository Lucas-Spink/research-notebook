import type {
  ArtefactsFileModel,
  SummaryPart,
} from "@research-notebook/format";
import { Fragment } from "react";
import {
  newerVersionUpdate,
  resolveReference,
} from "../expanded/model/artefactReference";
import { expandedMessages, tableMessages } from "../messages";

/** An artefact reference inside a summary cell (FR-EDT-06), resolved against
 * the experiment's artefacts.yaml so its label, "detached" and "newer
 * version" state are current. Deliberately not focusable or clickable: a
 * summary is a read-only overview (FR-TBL-05), and a click on it opens the
 * cell's own live editor, where chips are interactive (ADR-0043). */
function ReferenceChip({
  part,
  artefacts,
}: {
  part: Extract<SummaryPart, { kind: "ref" }>;
  artefacts: ArtefactsFileModel | null;
}) {
  const resolved = resolveReference(artefacts, {
    ulid: part.ulid,
    version: part.version,
    label: part.label,
  });
  if (resolved.status === "detached") {
    return (
      <span className="wtable__chip wtable__chip--detached">
        {resolved.label}
        <span className="wtable__chip-badge">
          {expandedMessages.detachedBadge}
        </span>
      </span>
    );
  }
  const newer =
    resolved.status === "resolved" && newerVersionUpdate(resolved) !== null;
  return (
    <span className="wtable__chip">
      {resolved.label}
      {newer && (
        <span className="wtable__chip-badge">
          {expandedMessages.newerVersionBadge}
        </span>
      )}
    </span>
  );
}

/** A cell's summary, clamped to a few lines by the style sheet. An artefact
 * reference shows as a chip (FR-EDT-06); the tooltip falls back to its
 * label, since a native `title` attribute cannot hold markup. */
export function SummaryCell({
  parts,
  artefacts,
}: {
  parts: readonly SummaryPart[];
  artefacts: ArtefactsFileModel | null;
}) {
  const flat = parts
    .map((part) => (part.kind === "ref" ? part.label : part.text))
    .join("");
  if (flat === "") {
    return (
      <span className="wtable__empty">
        <span aria-hidden="true">—</span>
        <span className="wtable__sr">{tableMessages.emptyCell}</span>
      </span>
    );
  }
  return (
    <div className="wtable__clamp" title={flat}>
      {parts.map((part, index) =>
        part.kind === "ref" ? (
          <ReferenceChip key={index} part={part} artefacts={artefacts} />
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </div>
  );
}
