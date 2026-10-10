# ADR-0058: Archived mode and unarchive

- Status: Proposed
- Date: 2026-10-10
- Deciders: maintainer
- Spec sections affected: 5.13 (rules 4 and 5), 6.3, 6.4; FR-ARC-09, FR-ARC-10; gate S6-G06

## Context

Opening an archived project read-only was already built (ADR-0022, ADR-0024: `mode.ts`, `reload.ts`, the banner). S6-T09 adds the two actions that were missing: marking a project archived, and unarchiving it with a backup and any migration. `AGENTS.md` rule 2 means only `packages/format` may read or write `project.yaml` text, and spec 6.3 lets `nb-archive` change only the archived flag.

## Decision

1. **`packages/format` makes both new texts.** `markArchived` sets `archived` to the time (seconds, UTC) and changes nothing else, not even `last_written_by`, because archiving does not claim to have written the records. `markUnarchived` sets `archived: null` (the one place `null` is written) and stamps the running version. Both are pure and take the clock as an argument.
2. **The webview stores the text through the existing `writeNotebookFile`.** No new command, no Rust parsing, no change to `capabilities/`. The write is guarded by the SHA-256 that was read, so a `project.yaml` changed in the meantime is never overwritten.
3. **Archiving needs the lock and gives it up.** After the write the application reads `project.yaml` again (`refreshProjectFile`), and the existing reload decides the mode: archived, read-only, lock released.
4. **Unarchive order: confirm, lock, backup, migration check, write.** An archived project holds no lock, so the lock is asked for first, without takeover; a live, stale or unreadable lock stops the flow with nothing written. The version-change backup (ADR-0025) is made next. Then the migration plan is worked out. Only then is the flag cleared. A failure at any step before the write gives the lock up again, so the project stays archived and read-only.
5. **Migrations.** `planMigration` and `runMigration` in `packages/format/src/migrations.ts` order and run pure steps; `MIGRATIONS` is empty because format version 1 is the only version. If a plan has steps, unarchive stops with `migrationNeeded` after the backup and writes nothing. Running steps over notebook files needs a read-all, write-all runner with its own fixtures, which belongs with the first real step (version 2) and its format ADR. This build can therefore not unarchive a project from an older format; none exists yet.
6. **Writes while archived are refused by construction.** Every write command requires a held lock (`writable` in `commands/projects/history.rs`), and an archived project never asks for one. Gate S6-G06 (`archived_project_is_not_written_when_opened_and_used`) opens and uses an archived project through `nb-fs` and compares a snapshot of the whole project, including `_notebook/`, before and after.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| A Rust command that edits the flag | Rust must not parse `project.yaml` (rule 2), and a line edit would bypass the canonical writer. |
| Stamp `last_written_by` when archiving | Spec 6.3 says the archiving crates change the flag only. |
| A migration runner now, with no steps to run | It could not be exercised against a real older format, so it would be untested code on user data. |
| Skip the lock when unarchiving | `writeNotebookFile` and the backup both require it, and it stops two windows unarchiving at once. |

## Consequences

- `packages/format/migrations/` (a protected path) is not created. Its location is a decision for the first migration.
- S6-G06 is shown by a read-only scenario at the `nb-fs` layer plus the existing lock check in the command layer. It does not drive the Tauri commands end to end.
- Archiving does not require the integrity check, manifest or exports to have been run; the panel only reminds the person to.
- Unarchiving from a newer format is refused as unreadable (`project.yaml` fails to parse), and nothing is written.
