import { fail, ok, type Result } from "./result";

/** Notebook files by path relative to the project folder, as text. */
export type MigrationFiles = Readonly<Record<string, string>>;

/**
 * One step from format version `from` to `to` (spec 5.13 rule 3). Steps are
 * pure and never deleted. Reading and writing the files is the caller's job.
 */
export interface Migration {
  from: number;
  to: number;
  run: (files: MigrationFiles) => MigrationFiles;
}

/** `project.yaml` and each experiment's `artefacts.yaml`: the files that carry `format_version`. */
const VERSIONED_FILE =
  /^_notebook\/(?:project\.yaml|experiments\/[^/]+\/artefacts\.yaml)$/;

// Only the first-level key at the start of a line, so a look-alike inside a
// quoted or block value is left alone. The lookahead keeps CRLF intact.
const VERSION_ONE = new RegExp("^(\\uFEFF?)format_version: 1(?=\\r?$)", "m");

/**
 * ADR-0064: version 2 adds canvas files and changes no existing file except
 * its `format_version`. The edit is on the text, not on a parsed model, so
 * unknown keys, comments, CRLF and a byte-order mark survive untouched. Inbox
 * requests are transient and not migrated (readers accept both versions).
 */
const toVersion2: Migration = {
  from: 1,
  to: 2,
  run: (files) =>
    Object.fromEntries(
      Object.entries(files).map(([path, text]) => [
        path,
        VERSIONED_FILE.test(path)
          ? text.replace(VERSION_ONE, "$1format_version: 2")
          : text,
      ]),
    ),
};

/** Every released step, oldest first (spec 5.13 rule 3). */
export const MIGRATIONS: readonly Migration[] = [toVersion2];

export type MigrationPlanError =
  /** The project is newer than the build, which cannot migrate it. */
  | { kind: "newer"; found: number; target: number }
  /** No step starts at `from`, so the chain is broken. */
  | { kind: "gap"; from: number };

/** The steps that take a project from `found` to `target`, in order. */
export function planMigration(
  found: number,
  target: number,
  steps: readonly Migration[],
): Result<readonly Migration[], MigrationPlanError> {
  if (found > target) return fail({ kind: "newer", found, target });
  const plan: Migration[] = [];
  let at = found;
  while (at < target) {
    const step = steps.find((candidate) => candidate.from === at);
    if (step === undefined || step.to <= at)
      return fail({ kind: "gap", from: at });
    plan.push(step);
    at = step.to;
  }
  return ok(plan);
}

/** Applies the steps in order. The input is not changed. */
export function runMigration(
  files: MigrationFiles,
  plan: readonly Migration[],
): MigrationFiles {
  return plan.reduce<MigrationFiles>(
    (current, step) => step.run(current),
    files,
  );
}
