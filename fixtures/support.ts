// Shared by the fixtures-compatibility suite (S2-G01, S2-G03, S2-G04, S2-G10).
// Fixtures are copied to a temporary directory before being opened
// (docs/testing-guide.md): the committed folder is never read by application
// code, only by this harness, and never written to.
import { createHash } from "node:crypto";
import {
  FORMAT_VERSION,
  MIGRATIONS,
  planMigration,
  projectFormatVersion,
  runMigration,
} from "../packages/format/src/index";
import type { Result } from "../packages/format/src/result";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * One folder per format version that has fixtures (spec 5.13 rule 6). Released
 * folders are immutable, so a new version's cases go in a new folder.
 */
const PROJECT_ROOTS = ["format-v1", "format-v2"].map((folder) =>
  join(__dirname, "projects", folder),
);

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
  /** Every canvas file under `_notebook/canvases/`, relative to the fixture root. */
  canvasFiles(): string[];
  /** One file's text as committed, before any migration; read-only, for checking what a migration changed. */
  readSource(relativePath: string): string;
};

/** Unwraps a result the fixtures suite expects to succeed, or fails with the format's own error. */
export function must<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`expected success: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** The name of every fixture under `fixtures/projects/format-v<N>/`. Names are unique across versions. */
export function listFixtures(): string[] {
  return PROJECT_ROOTS.filter((root) => existsSync(root)).flatMap((root) =>
    readdirSync(root).filter((name) =>
      statSync(join(root, name)).isDirectory(),
    ),
  );
}

function sourceOf(name: string): string {
  const root = PROJECT_ROOTS.find((candidate) =>
    existsSync(join(candidate, name)),
  );
  if (root === undefined) throw new Error(`no fixture named ${name}`);
  return join(root, name);
}

/**
 * Brings a copied fixture written by an older build up to the current format
 * the way the application does (spec 5.13, ADR-0064): the migration steps run
 * on the copy's `project.yaml` and `artefacts.yaml`. A fixture already at the
 * current version, or from a newer one, is left alone. Only the copy is
 * written; the committed folder is never touched.
 */
function migrateCopy(root: string): void {
  const projectPath = "_notebook/project.yaml";
  const projectFile = join(root, ...projectPath.split("/"));
  if (!existsSync(projectFile)) return;
  const version = projectFormatVersion(readFileSync(projectFile, "utf8"));
  if (version === null || version >= FORMAT_VERSION) return;
  const plan = planMigration(version, FORMAT_VERSION, MIGRATIONS);
  if (!plan.ok) return;

  const paths = [projectPath];
  const experiments = join(root, "_notebook", "experiments");
  if (existsSync(experiments)) {
    for (const folder of readdirSync(experiments)) {
      const relative = `_notebook/experiments/${folder}/artefacts.yaml`;
      if (existsSync(join(root, ...relative.split("/")))) paths.push(relative);
    }
  }
  const before = Object.fromEntries(
    paths.map((path) => [
      path,
      readFileSync(join(root, ...path.split("/")), "utf8"),
    ]),
  );
  const after = runMigration(before, plan.value);
  for (const path of paths) {
    const text = after[path];
    if (text !== undefined && text !== before[path]) {
      writeFileSync(join(root, ...path.split("/")), text, "utf8");
    }
  }
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
 * Copies fixture `name` to a fresh temporary directory, migrates it to the
 * current format if it is older, and reads its `fixture.json` marker. Throws if the fixture, or its marker, is missing —
 * a fixture without one cannot be checked against S2-G01.
 */
export function openFixture(name: string): CopiedFixture {
  const source = sourceOf(name);
  const root = mkdtempSync(join(tmpdir(), `nb-fixture-${name}-`));
  cpSync(source, root, { recursive: true });
  migrateCopy(root);

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
    canvasFiles: () =>
      listFilesUnder(root, "_notebook/canvases", ".canvas.json"),
    readSource: (relative) =>
      readFileSync(join(source, ...relative.split("/")), "utf8"),
  };
}
