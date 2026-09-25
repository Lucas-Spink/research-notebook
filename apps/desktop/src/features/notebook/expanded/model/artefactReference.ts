import type {
  ArtefactModel,
  ArtefactsFileModel,
} from "@research-notebook/format";

/** What an `artefactRef` node's attributes hold, once read safely from the
 * (structurally untyped) Tiptap node attrs object. */
export type ReferenceAttrs = {
  ulid: string | null;
  version: number | null;
  label: string;
};

/** Reads a reference node's attrs, falling back to `null`/`""` for anything
 * that is not the shape `packages/format`'s schema gives it — the same
 * defensive style `StaticSectionContent` already uses for other node attrs. */
export function readReferenceAttrs(
  attrs: Record<string, unknown> | undefined,
): ReferenceAttrs {
  const ulid = typeof attrs?.ulid === "string" ? attrs.ulid : null;
  const version = typeof attrs?.version === "number" ? attrs.version : null;
  const label = typeof attrs?.label === "string" ? attrs.label : "";
  return { ulid, version, label };
}

/** What a reference chip shows and can act on (FR-EDT-06). */
export type ResolvedReference =
  | { status: "pending"; label: string }
  /** The ULID is not in the experiment's artefacts, or the pinned version
   * is not among its versions (FR-EDT-08's territory; not yet marked
   * differently here — kept inert instead, see `ArtefactRefChip`). */
  | { status: "detached"; label: string }
  | {
      status: "resolved";
      artefact: ArtefactModel;
      /** The artefact's current display name, not the label stored at insert time. */
      label: string;
      fileName: string;
      /** The pinned version, or `null` for a link-mode artefact (spec 5.6: no version for link mode). */
      version: number | null;
    };

function lastSegment(path: string): string {
  return path.split("/").at(-1) ?? path;
}

/**
 * The reference's current metadata, read fresh from the experiment's
 * artefacts.yaml (FR-EDT-06): the display name, filename and pinned version
 * to show on hover or focus, and what `onActivate` should open.
 */
export function resolveReference(
  file: ArtefactsFileModel | null,
  attrs: ReferenceAttrs,
): ResolvedReference {
  if (file === null) return { status: "pending", label: attrs.label };
  const artefact = file.artefacts.find((a) => a.id === attrs.ulid);
  if (artefact === undefined) {
    return { status: "detached", label: attrs.label };
  }
  if (artefact.mode === "copy") {
    const version = artefact.versions.find((v) => v.v === attrs.version);
    if (version === undefined) {
      return { status: "detached", label: attrs.label };
    }
    return {
      status: "resolved",
      artefact,
      label: artefact.name,
      fileName: lastSegment(version.file),
      version: version.v,
    };
  }
  return {
    status: "resolved",
    artefact,
    label: artefact.name,
    fileName: lastSegment(artefact.source.path),
    version: null,
  };
}

/** The attrs a reference should take to point at its artefact's latest
 * version (FR-EDT-07). `null` when there is nothing to update to: the
 * reference is not resolved, its artefact is link mode (no versions to be
 * newer than), or it is already pinned to the latest version. */
export function newerVersionUpdate(
  resolved: ResolvedReference,
): { version: number; target: string; label: string } | null {
  if (resolved.status !== "resolved") return null;
  if (resolved.artefact.mode !== "copy") return null;
  const latest = resolved.artefact.versions.at(-1);
  if (latest === undefined || resolved.version === null) return null;
  if (latest.v <= resolved.version) return null;
  return {
    version: latest.v,
    target: latest.file,
    label: resolved.artefact.name,
  };
}
