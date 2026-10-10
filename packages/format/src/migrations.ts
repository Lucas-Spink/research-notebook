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

/**
 * Every released step, oldest first. Format version 1 is the only version, so
 * the table is empty; the first change to chapter 5 adds its step here.
 */
export const MIGRATIONS: readonly Migration[] = [];

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
