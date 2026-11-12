import type { KnownProject } from "./known-projects";
import { isInsideProject } from "./project-tree";

/** A folder a file's source is recorded relative to: `project` or an external root's id. */
export interface SourceBase {
  id: string;
  folder: string;
}

/**
 * Which folder `file`'s source is recorded against (spec 5.10): the project
 * if the file is inside it, otherwise the deepest of its external roots whose
 * folder holds the file. `undefined` when none does, so the file cannot be
 * recorded. Roots are the ones that have a folder set on this machine.
 */
export function locateFile(
  file: string,
  projectRoot: string,
  roots: readonly SourceBase[],
): SourceBase | undefined {
  if (isInsideProject(projectRoot, file)) {
    return { id: "project", folder: projectRoot };
  }
  let best: SourceBase | undefined;
  for (const root of roots) {
    if (!isInsideProject(root.folder, file)) continue;
    if (best === undefined || root.folder.length > best.folder.length) {
      best = { id: root.id, folder: root.folder };
    }
  }
  return best;
}

/** The projects that can take `file`: it is inside the project or in one of its external roots. */
export function projectsHolding(
  file: string,
  projects: readonly KnownProject[],
): KnownProject[] {
  return projects.filter(
    (project) =>
      locateFile(file, project.root, project.externalRoots) !== undefined,
  );
}
