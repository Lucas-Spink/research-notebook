import {
  applyCapture,
  applyLink,
  applyRelink,
  artefactsOf,
  knownVersionsFor,
  parseRequest,
  planInboxImport,
  type ArtefactsFileModel,
  type CaptureTarget,
  type NotebookError,
  type NotebookState,
  type Result,
} from "@research-notebook/format";
import { assertNever } from "../../../shared/assertNever";
import type {
  CaptureNaming,
  Destination,
  FolderHandle,
  KnownVersionInput,
  commands,
} from "../../../ipc/bindings";
import { versionNaming } from "../table/model/addEvidence";
import type { EditArtefacts } from "./api";

/** The commands importing the inbox on open needs. */
export type InboxApi = Pick<
  typeof commands,
  | "listInboxRequests"
  | "readInboxRequest"
  | "importInboxPayload"
  | "removeInboxRequest"
>;

/** One waiting request that could not be imported, kept in the inbox with its reason (spec 5.10). */
export type InvalidInboxRequest = { request: string; reason: string };

/** Why a request could not be read or matched, in words for the person. */
function planFailureReason(error: NotebookError): string {
  switch (error.kind) {
    case "invalid":
      return error.message;
    case "notFound":
      return `its ${error.entity} no longer exists`;
    default:
      return assertNever(error);
  }
}

/** `editArtefacts`'s `change` returns the whole file, but `applyCapture`,
 * `applyLink` and `applyRelink` each return it alongside other values. */
function justFile(
  applied: Result<{ file: ArtefactsFileModel }, NotebookError>,
): Result<ArtefactsFileModel, NotebookError> {
  return applied.ok ? { ok: true, value: applied.value.file } : applied;
}

function experimentFolderFor(
  state: NotebookState,
  experimentId: string,
): string | undefined {
  return state.experiments.find(
    (experiment) => experiment.file.frontmatter.id === experimentId,
  )?.folder;
}

function existingArtefact(file: ArtefactsFileModel, target: CaptureTarget) {
  return target.kind === "existing"
    ? file.artefacts.find((a) => a.id === target.artefactId)
    : undefined;
}

/** Which of an experiment's folders an inbox copy goes into (ADR-0044 point 6). */
function destinationFor(
  target: CaptureTarget,
  file: ArtefactsFileModel,
): Destination {
  const role =
    target.kind === "new" ? target.role : existingArtefact(file, target)?.role;
  return role === "method" ? "methods" : "evidence";
}

/** As `addEvidenceFiles`' own `copy` (FR-EVD-04): a later version is named
 * after the artefact's first; a new artefact keeps the payload's own name. */
function namingFor(
  target: CaptureTarget,
  file: ArtefactsFileModel,
  payload: string,
): CaptureNaming {
  const existing = existingArtefact(file, target);
  return (
    (existing === undefined ? null : versionNaming(existing)) ?? {
      kind: "new",
      originalFileName: payload,
    }
  );
}

/**
 * Imports one waiting request (ADR-0044 point 6): reads and plans it against
 * `experimentFolder`'s current artefacts, has Rust carry out a copy-mode
 * placement or trusts a link/relink's declared observation, records the
 * result through `editArtefacts`, then removes the request. Returns why the
 * request could not be imported, or `null` once it has been (or its content
 * was already recorded, so there was nothing left to do).
 */
async function importOne(
  api: InboxApi,
  folder: FolderHandle,
  state: NotebookState,
  editArtefacts: EditArtefacts,
  requestId: string,
): Promise<InvalidInboxRequest | null> {
  const invalid = (reason: string): InvalidInboxRequest => ({
    request: requestId,
    reason,
  });

  const read = await api.readInboxRequest(folder, requestId);
  if (read.status === "error") {
    return invalid("its request.json could not be read");
  }

  const parsedForExperiment = parseRequest(read.data);
  if (!parsedForExperiment.ok)
    return invalid(parsedForExperiment.error.message);
  const experimentFolder = experimentFolderFor(
    state,
    parsedForExperiment.value.experiment_id,
  );
  if (experimentFolder === undefined) {
    return invalid("its experiment no longer exists");
  }
  const file = artefactsOf(state, experimentFolder);
  if (file === null) {
    return invalid("this experiment's artefacts.yaml could not be read");
  }

  const planned = planInboxImport({
    requestId,
    requestText: read.data,
    file,
  });
  if (!planned.ok) return invalid(planFailureReason(planned.error));
  const plan = planned.value;

  if (plan.kind === "copy") {
    const known: KnownVersionInput[] = knownVersionsFor(
      file,
      plan.target.kind === "existing" ? plan.target.artefactId : undefined,
    ).map((k) => ({
      sha256: k.sha256,
      number: k.number,
      sameArtefact: k.sameArtefact,
    }));
    const captured = await api.importInboxPayload(
      folder,
      requestId,
      plan.payload,
      plan.sha256,
      plan.size,
      experimentFolder,
      destinationFor(plan.target, file),
      namingFor(plan.target, file, plan.payload),
      known,
    );
    if (captured.status === "error") {
      return invalid("its file could not be placed in the experiment");
    }
    if (captured.data.result.kind === "duplicate") {
      // Already recorded; nothing left but to clear the request.
      await api.removeInboxRequest(folder, requestId);
      return null;
    }
    const { result } = captured.data;
    const size = result.size ?? plan.size;
    const saved = await editArtefacts(experimentFolder, (f, env) =>
      justFile(
        applyCapture(
          f,
          plan.target,
          {
            file: result.file,
            sha256: result.sha256,
            size,
            number: result.number,
          },
          env,
        ),
      ),
    );
    if (!saved.ok) return null; // Placed but not recorded: retried on the next open.
    await api.removeInboxRequest(folder, requestId);
    return null;
  }

  if (plan.kind === "link") {
    const saved = await editArtefacts(experimentFolder, (f, env) =>
      justFile(applyLink(f, plan.target, plan.observation, env)),
    );
    if (!saved.ok) return null;
    await api.removeInboxRequest(folder, requestId);
    return null;
  }

  if (plan.kind === "relink") {
    const saved = await editArtefacts(experimentFolder, (f, env) =>
      justFile(
        applyRelink(f, plan.artefactId, plan.source, plan.observation, env),
      ),
    );
    if (!saved.ok) return null;
    await api.removeInboxRequest(folder, requestId);
    return null;
  }

  return assertNever(plan);
}

/**
 * Imports every request waiting in the project's inbox when a writable
 * project opens (ADR-0044 point 6, spec 5.10): one after another, so each is
 * planned against what the last one recorded. `state` is read fresh before
 * every request, so an earlier import in the same batch is accounted for.
 */
export async function importInboxOnOpen(
  api: InboxApi,
  folder: FolderHandle,
  state: () => NotebookState | null,
  editArtefacts: EditArtefacts,
): Promise<InvalidInboxRequest[]> {
  const listed = await api.listInboxRequests(folder);
  if (listed.status === "error") return [];

  const invalid: InvalidInboxRequest[] = [];
  for (const requestId of listed.data) {
    const current = state();
    if (current === null) break;
    const result = await importOne(
      api,
      folder,
      current,
      editArtefacts,
      requestId,
    );
    if (result !== null) invalid.push(result);
  }
  return invalid;
}
