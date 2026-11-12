import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parseProject } from "@research-notebook/format";

import {
  knownProjects,
  type KnownProject,
  type ProjectInfo,
} from "./known-projects";
import { parseSettings, settingsPath } from "./strata-settings";

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function readProject(root: string): ProjectInfo | undefined {
  const text = readText(join(root, "_notebook", "project.yaml"));
  if (text === undefined) return undefined;
  const parsed = parseProject(text);
  if (!parsed.ok) return undefined;
  const { id, name, external_roots } = parsed.value;
  return {
    id,
    name,
    roots: external_roots.map(({ id: rootId, label }) => ({
      id: rootId,
      label,
    })),
  };
}

/**
 * The projects to offer, read from disk now: the workspace's, and the ones the
 * desktop app remembers and has open (ADR-0069). Reads only. A settings file
 * that is missing or not understood leaves the workspace's projects alone.
 */
export function readKnownProjects(workspaceFolders: readonly string[]): {
  open: KnownProject[];
  recent: KnownProject[];
} {
  const text = readText(settingsPath(process.platform, process.env, homedir()));
  return knownProjects(
    workspaceFolders,
    text === undefined ? undefined : parseSettings(text),
    {
      exists: existsSync,
      readProject,
      readLock: (root) => readText(join(root, "_notebook", ".lock")),
      now: new Date(),
    },
  );
}
