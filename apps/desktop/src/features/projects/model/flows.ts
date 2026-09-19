import { newProject, type ProjectEnv } from "@research-notebook/format";
import type {
  commands,
  FolderHandle,
  ProjectError,
} from "../../../ipc/bindings";
import {
  locateOutcome,
  summariseProject,
  type OpenFailure,
  type ProjectSummary,
} from "./summary";

/** The commands the flows call, so tests can supply a fake with the same shape. */
export type Api = Pick<
  typeof commands,
  | "appVersion"
  | "createProject"
  | "openProject"
  | "openRecentProject"
  | "locateProject"
  | "rememberProject"
  | "externalRootStatus"
  | "setExternalRoot"
>;

/** Keys of the messages shown when a flow fails (`messages.ts`). */
export type FailureReason =
  ProjectError["kind"] | OpenFailure | "invalidName" | "differentProject";

/** Something that went wrong after the project was already created or opened. */
export type Warning =
  | { kind: "hygieneFailed"; files: string[] }
  | { kind: "notRemembered"; reason: ProjectError["kind"] };

export type OpenedProject = {
  folder: FolderHandle;
  /** For display only. */
  path: string;
  summary: ProjectSummary;
};

export type FlowOutcome =
  | { kind: "cancelled" }
  | { kind: "opened"; project: OpenedProject; warnings: Warning[] }
  | { kind: "failed"; reason: FailureReason };

/** An external root of the open project and where it is on this machine. */
export type ExternalRoot = {
  id: string;
  label: string;
  path: string | null;
  available: boolean;
};

type OpenedFolder = { folder: FolderHandle; path: string; projectYaml: string };

const failed = (reason: FailureReason): FlowOutcome => ({
  kind: "failed",
  reason,
});

/**
 * Puts the project first in the recent list and reports it opened. A project
 * that could not be remembered is still open: only the list is affected.
 */
async function finishOpen(
  api: Api,
  project: OpenedProject,
  warnings: Warning[] = [],
): Promise<FlowOutcome> {
  const { folder, summary } = project;
  const remembered = await api.rememberProject(
    folder,
    summary.id,
    summary.name,
  );
  return {
    kind: "opened",
    project,
    warnings:
      remembered.status === "error"
        ? [
            ...warnings,
            { kind: "notRemembered", reason: remembered.error.kind },
          ]
        : warnings,
  };
}

/**
 * Reads the text a folder gave with `packages/format`. When `expectedId` is
 * given the folder must hold that project, as when opening from the recent
 * list or locating a moved one. Nothing is remembered unless it does.
 */
async function readOpened(
  api: Api,
  folder: OpenedFolder,
  expectedId?: string,
): Promise<FlowOutcome> {
  let summary: ProjectSummary;
  if (expectedId === undefined) {
    const read = summariseProject(folder.projectYaml);
    if (!read.ok) return failed(read.error);
    summary = read.value;
  } else {
    const outcome = locateOutcome(expectedId, folder.projectYaml);
    if (outcome.kind === "failed") return failed(outcome.error);
    if (outcome.kind === "differentProject") return failed("differentProject");
    summary = outcome.summary;
  }
  return finishOpen(api, {
    folder: folder.folder,
    path: folder.path,
    summary,
  });
}

/**
 * Creates a project (FR-PRJ-01). The files are built by `packages/format`
 * before the person is asked for a folder, so an invalid name never opens a
 * dialog.
 */
export async function createFlow(
  api: Api,
  name: string,
  env: ProjectEnv,
): Promise<FlowOutcome> {
  const built = newProject({ name, appVersion: await api.appVersion() }, env);
  if (!built.ok) return failed("invalidName");
  const { project, projectYaml, bibliographyJson } = built.value;
  const evidenceInGit = project.capture.evidence_in_git;

  const created = await api.createProject(
    projectYaml,
    bibliographyJson,
    evidenceInGit,
  );
  if (created.status === "error") return failed(created.error.kind);
  if (created.data === null) return { kind: "cancelled" };

  const notUpdated = created.data.hygiene
    .filter((report) => report.status === "failed")
    .map((report) => report.file);
  return finishOpen(
    api,
    {
      folder: created.data.folder,
      path: created.data.path,
      summary: {
        id: project.id,
        name: project.name,
        evidenceInGit,
        externalRoots: [],
      },
    },
    notUpdated.length > 0 ? [{ kind: "hygieneFailed", files: notUpdated }] : [],
  );
}

/** Asks for a project folder and opens it (FR-PRJ-02). */
export async function openFlow(api: Api): Promise<FlowOutcome> {
  const opened = await api.openProject();
  if (opened.status === "error") return failed(opened.error.kind);
  if (opened.data === null) return { kind: "cancelled" };
  return readOpened(api, opened.data);
}

/** Opens a recent project at the path last remembered for it. */
export async function openRecentFlow(
  api: Api,
  projectId: string,
): Promise<FlowOutcome> {
  const opened = await api.openRecentProject(projectId);
  if (opened.status === "error") return failed(opened.error.kind);
  return readOpened(api, opened.data, projectId);
}

/** Asks where a moved project is now, and records the new path (FR-PRJ-03). */
export async function locateFlow(
  api: Api,
  projectId: string,
): Promise<FlowOutcome> {
  const located = await api.locateProject();
  if (located.status === "error") return failed(located.error.kind);
  if (located.data === null) return { kind: "cancelled" };
  return readOpened(api, located.data, projectId);
}

/**
 * The external roots a project declares, with where each is on this machine
 * (FR-PRJ-07). If the settings cannot be read every root shows as unresolved,
 * which is what marks its artefacts unavailable, rather than hiding them.
 */
export async function externalRootsFlow(
  api: Api,
  summary: ProjectSummary,
): Promise<ExternalRoot[]> {
  if (summary.externalRoots.length === 0) return [];
  const status = await api.externalRootStatus(
    summary.id,
    summary.externalRoots.map((root) => root.id),
  );
  const known = status.status === "ok" ? status.data : [];
  return summary.externalRoots.map((root) => {
    const found = known.find((entry) => entry.rootId === root.id);
    return {
      id: root.id,
      label: root.label,
      path: found?.path ?? null,
      available: found?.available ?? false,
    };
  });
}

/**
 * Asks for the folder an external root has on this machine, then reports the
 * roots again. `null` when the person cancels, and a failure when the choice
 * could not be saved; either way nothing changed.
 */
export async function chooseExternalRootFlow(
  api: Api,
  summary: ProjectSummary,
  rootId: string,
): Promise<
  { roots: ExternalRoot[] } | { failure: ProjectError["kind"] } | null
> {
  const chosen = await api.setExternalRoot(summary.id, rootId);
  if (chosen.status === "error") return { failure: chosen.error.kind };
  if (chosen.data === null) return null;
  return { roots: await externalRootsFlow(api, summary) };
}
