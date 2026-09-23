import { dirname, join } from "node:path";

/** `_notebook/project.yaml`, relative to a candidate project root. */
const PROJECT_FILE = "_notebook/project.yaml";

/**
 * Finds the project a file belongs to by searching upwards from its folder
 * for `_notebook/project.yaml` (FR-VSC-02), stopping at the filesystem
 * root. `exists` is injected so tests can use a real temporary directory
 * tree without this module reading the real filesystem directly.
 */
export function findProjectRoot(
  startDir: string,
  exists: (path: string) => boolean,
): string | undefined {
  let dir = startDir;
  for (;;) {
    if (exists(join(dir, PROJECT_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
