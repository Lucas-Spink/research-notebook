import { parseRequest } from "../files";
import { fail, ok, type Result } from "../result";
import {
  ARTEFACT_TYPES,
  type ArtefactModel,
  type ArtefactsFileModel,
  type InboxRequestModel,
} from "../schema";
import type { CaptureTarget } from "./capture";
import type { LinkObservation, LinkTarget } from "./link";
import { invalid } from "./project-edit";
import type { NotebookError } from "./types";

type ArtefactType = (typeof ARTEFACT_TYPES)[number];

/**
 * A file extension to one of the nine artefact types (spec 5.8 `type`),
 * used only when an inbox request creates a brand-new artefact: request.json
 * (spec 5.10) carries no type of its own. Deliberately minimal and provisional
 * — S3-T10 (previews) owns the canonical, spec 8 extension-to-preview
 * mapping and may refine or replace this one.
 */
const EXTENSION_TYPES: Record<string, ArtefactType> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  bmp: "image",
  webp: "image",
  tif: "image",
  tiff: "image",
  pdf: "pdf",
  svg: "svg",
  csv: "table",
  tsv: "table",
  py: "script",
  r: "script",
  sh: "script",
  jl: "script",
  js: "script",
  ts: "script",
  m: "script",
  ipynb: "notebook",
  html: "html",
  htm: "html",
  txt: "text",
  md: "text",
  log: "text",
  json: "text",
  yaml: "text",
  yml: "text",
};

/** The filename's last extension, lower-cased, without its dot; `""` for none. */
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot <= 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** Maps a filename to an artefact type by extension (see [`EXTENSION_TYPES`]); `"other"` for anything unrecognised. */
export function inferArtefactType(fileName: string): ArtefactType {
  return EXTENSION_TYPES[extensionOf(fileName)] ?? "other";
}

/** The filename without its last extension (FR-EVD-11's default display name). */
export function defaultDisplayName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot <= 0 ? fileName : fileName.slice(0, dot);
}

/** The last `/`-separated segment of a source path, as a filename. */
function lastSegment(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/** Finds the artefact, if any, whose recorded source is the same file. */
export function matchInboxSource(
  file: ArtefactsFileModel,
  source: { root: string; path: string },
): ArtefactModel | undefined {
  return file.artefacts.find(
    (artefact) =>
      artefact.source.root === source.root &&
      artefact.source.path === source.path,
  );
}

/** Every copy-mode version's hash across `file`, in the shape `nb-fs`'s
 * `KnownVersion` mirrors, so a caller can build its dedupe/versioning
 * argument straight from an already-loaded `ArtefactsFileModel`. */
export interface KnownVersionInfo {
  sha256: string;
  number: number;
  sameArtefact: boolean;
}

export function knownVersionsFor(
  file: ArtefactsFileModel,
  artefactId?: string,
): KnownVersionInfo[] {
  return file.artefacts
    .filter((artefact) => artefact.mode === "copy")
    .flatMap((artefact) =>
      artefact.versions.map((version) => ({
        sha256: version.sha256,
        number: version.v,
        sameArtefact: artefact.id === artefactId,
      })),
    );
}

/** What an inbox request (spec 5.10) resolves to once matched against an
 * experiment's `artefacts.yaml`: what `nb-fs` must place on disk, and what
 * `applyCapture`/`applyLink`/`applyRelink` record once it has. */
export type InboxImportPlan =
  | {
      kind: "copy";
      target: CaptureTarget;
      payload: string;
      sha256: string;
      size: number;
    }
  | { kind: "link"; target: LinkTarget; observation: LinkObservation }
  | {
      kind: "relink";
      artefactId: string;
      source: { root: string; path: string };
      observation: LinkObservation;
    };

/**
 * Validates and plans one inbox request (spec 5.10): parses `request.json`,
 * checks its `request_id` names the folder it came from, matches its
 * `source` against `file`'s artefacts, and returns what to do next. Never
 * touches `applyCapture`/`applyLink`/`applyRelink` itself — those run after
 * `nb-fs` has physically placed (or, for a link, observed) the file, the
 * same "decide, then record" split `capture.ts`/`link.ts` already use.
 *
 * A link-mode observation uses `request.sha256`, `request.size` and
 * `request.created` as recorded by the writer: resolving `source.root`/
 * `source.path` to re-read the file at import time needs external-root
 * resolution, which is the project loader's job (ADR-0031), not this
 * function's. `request.group_path` is accepted by the schema but not acted
 * on here: virtual groups do not exist yet (S3-T08).
 */
export function planInboxImport(params: {
  requestId: string;
  requestText: string;
  file: ArtefactsFileModel;
}): Result<InboxImportPlan, NotebookError> {
  const parsed = parseRequest(params.requestText);
  if (!parsed.ok) return fail(invalid(parsed.error.message));
  const request: InboxRequestModel = parsed.value;

  if (request.request_id !== params.requestId) {
    return fail(
      invalid(
        "the request's request_id does not match its folder name",
        "request_id",
      ),
    );
  }

  const matched = matchInboxSource(params.file, request.source);
  if (matched !== undefined) {
    if (matched.role !== request.role) {
      return fail(
        invalid(
          "the matched artefact has a different role than the request",
          "role",
        ),
      );
    }
    if (matched.mode !== request.mode) {
      return fail(
        invalid(
          "the matched artefact has a different mode than the request",
          "mode",
        ),
      );
    }
  }

  if (request.mode === "copy") {
    if (request.payload === null) {
      return fail(
        invalid("a copy-mode request must have a payload", "payload"),
      );
    }
    const target: CaptureTarget =
      matched === undefined
        ? {
            kind: "new",
            name: defaultDisplayName(request.payload),
            role: request.role,
            type: inferArtefactType(request.payload),
            source: request.source,
          }
        : { kind: "existing", artefactId: matched.id };
    return ok({
      kind: "copy",
      target,
      payload: request.payload,
      sha256: request.sha256,
      size: request.size,
    });
  }

  const observation: LinkObservation = {
    sha256: request.sha256,
    size: request.size,
    observedMtime: request.created,
  };
  if (matched === undefined) {
    return ok({
      kind: "link",
      target: {
        name: defaultDisplayName(lastSegment(request.source.path)),
        role: request.role,
        type: inferArtefactType(request.source.path),
        source: request.source,
      },
      observation,
    });
  }
  return ok({
    kind: "relink",
    artefactId: matched.id,
    source: request.source,
    observation,
  });
}
