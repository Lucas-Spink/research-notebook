import { basename, join, resolve } from "node:path";

import { lockState, type LockState } from "./lock-state";
import { projectRootsOf } from "./project-tree";
import type { StrataSettings } from "./strata-settings";

/** What a project's own `project.yaml` says that the pane needs. */
export interface ProjectInfo {
  id: string;
  name: string;
  /** The project's external roots (id and label); folders are per machine. */
  roots: { id: string; label: string }[];
}

/** An external root of a project and where it is on this machine. */
export interface ExternalRootFolder {
  id: string;
  label: string;
  folder: string;
}

/** A project the pane can offer, and whether the desktop app has it open. */
export interface KnownProject {
  root: string;
  name: string;
  /** `undefined` when `project.yaml` could not be read. */
  id: string | undefined;
  state: LockState;
  /** Whether a VS Code workspace folder is in this project. */
  inWorkspace: boolean;
  /** Only the roots that have a folder set on this machine. */
  externalRoots: ExternalRootFolder[];
}

/** The reading the pane does, injected so this module needs no filesystem or VS Code. */
export interface Deps {
  exists: (path: string) => boolean;
  readProject: (root: string) => ProjectInfo | undefined;
  /** The text of the project's `_notebook/.lock`, or `undefined` if there is none. */
  readLock: (root: string) => string | undefined;
  now: Date;
}

/** Folder identity for de-duplication: Windows paths ignore case. */
const same = (a: string, b: string): boolean =>
  process.platform === "win32"
    ? resolve(a).toLowerCase() === resolve(b).toLowerCase()
    : resolve(a) === resolve(b);

/**
 * The projects to list: those the VS Code workspace folders belong to first,
 * then those the desktop app remembers (most recent first), each once. A
 * remembered project whose folder or `project.yaml` is gone is dropped. Open
 * means the lock's heartbeat is fresh, which holds for any number of projects
 * at once, in as many app instances. Without a settings file (`undefined`)
 * the workspace alone is used.
 */
export function knownProjects(
  workspaceFolders: readonly string[],
  settings: StrataSettings | undefined,
  deps: Deps,
): { open: KnownProject[]; recent: KnownProject[] } {
  const roots = projectRootsOf(workspaceFolders, deps.exists);
  const fromWorkspace = new Set(roots);
  for (const entry of settings?.recent ?? []) {
    const known = roots.some((root) => same(root, entry.path));
    if (!known && deps.exists(join(entry.path, "_notebook", "project.yaml"))) {
      roots.push(entry.path);
    }
  }

  const open: KnownProject[] = [];
  const recent: KnownProject[] = [];
  for (const root of roots) {
    const info = deps.readProject(root);
    const state = lockState(deps.readLock(root), deps.now);
    const folders =
      info === undefined ? {} : (settings?.externalRoots[info.id] ?? {});
    const project: KnownProject = {
      root,
      name: info?.name ?? basename(root),
      id: info?.id,
      state,
      inWorkspace: fromWorkspace.has(root),
      externalRoots: (info?.roots ?? []).flatMap((external) => {
        const folder = folders[external.id];
        return folder === undefined
          ? []
          : [{ id: external.id, label: external.label, folder }];
      }),
    };
    (state === "open" ? open : recent).push(project);
  }
  return { open, recent };
}
