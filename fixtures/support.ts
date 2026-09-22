// Shared by the fixtures-compatibility suite (S2-G01, S2-G03, S2-G04, S2-G10).
// Fixtures are copied to a temporary directory before being opened
// (docs/testing-guide.md): the committed folder is never read by application
// code, only by this harness, and never written to.
import { createHash } from "node:crypto";
import type { Result } from "../packages/format/src/result";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROJECTS_ROOT = join(__dirname, "projects", "format-v1");

/** What `fixture.json` at a fixture's root says about it (S2-T13, ADR-0029). */
export type FixtureMarker = {
  kind: string;
  /** Whether every file is the application's own canonical byte sequence (format-v1.md 3.2). */
  canonical: boolean;
};

/** A fixture copied to a fresh temporary directory, ready to open. */
export type CopiedFixture = {
  name: string;
  marker: FixtureMarker;
  /** Reads one file's text, relative to the fixture root (e.g. `_notebook/project.yaml`). */
  read(relativePath: string): string;
  /** Reads one file's raw bytes, for checking things text hides (a byte-order mark, CRLF). */
  readBytes(relativePath: string): Buffer;
  /** SHA-256 of one file's raw bytes, for checking nothing was written to it. */
  hash(relativePath: string): string;
  /** Every experiment's `experiment.md`, relative to the fixture root. */
  experimentFiles(): string[];
  /** Every question file under `_notebook/questions/`, relative to the fixture root. */
  questionFiles(): string[];
  /** Every experiment's `artefacts.yaml`, relative to the fixture root. */
  artefactsFiles(): string[];
};

/** Unwraps a result the fixtures suite expects to succeed, or fails with the format's own error. */
export function must<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`expected success: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** The name of every fixture committed under `fixtures/projects/format-v1/`. */
export function listFixtures(): string[] {
  return readdirSync(PROJECTS_ROOT).filter((name) =>
    statSync(join(PROJECTS_ROOT, name)).isDirectory(),
  );
}

function listFilesUnder(
  root: string,
  relativeDir: string,
  suffix: string,
): string[] {
  const dir = join(root, relativeDir);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith(suffix))
    .map((name) => `${relativeDir}/${name}`.replace(/\\/g, "/"));
}

function listExperimentFiles(root: string, fileName: string): string[] {
  const dir = join(root, "_notebook", "experiments");
  let folders: string[];
  try {
    folders = readdirSync(dir).filter((name) =>
      statSync(join(dir, name)).isDirectory(),
    );
  } catch {
    return [];
  }
  return folders
    .map((folder) => `_notebook/experiments/${folder}/${fileName}`)
    .filter((relative) => {
      try {
        statSync(join(root, ...relative.split("/")));
        return true;
      } catch {
        return false;
      }
    });
}

/**
 * Copies fixture `name` to a fresh temporary directory and reads its
 * `fixture.json` marker. Throws if the fixture, or its marker, is missing —
 * a fixture without one cannot be checked against S2-G01.
 */
export function openFixture(name: string): CopiedFixture {
  const source = join(PROJECTS_ROOT, name);
  const root = mkdtempSync(join(tmpdir(), `nb-fixture-${name}-`));
  cpSync(source, root, { recursive: true });

  const markerText = readFileSync(join(root, "fixture.json"), "utf8");
  const marker = JSON.parse(markerText) as FixtureMarker;

  const pathOf = (relative: string) => join(root, ...relative.split("/"));

  return {
    name,
    marker,
    read: (relative) => readFileSync(pathOf(relative), "utf8"),
    readBytes: (relative) => readFileSync(pathOf(relative)),
    hash: (relative) =>
      createHash("sha256")
        .update(readFileSync(pathOf(relative)))
        .digest("hex"),
    experimentFiles: () => listExperimentFiles(root, "experiment.md"),
    artefactsFiles: () => listExperimentFiles(root, "artefacts.yaml"),
    questionFiles: () => listFilesUnder(root, "_notebook/questions", ".md"),
  };
}
