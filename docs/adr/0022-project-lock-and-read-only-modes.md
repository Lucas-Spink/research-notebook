# ADR-0022: The project lock and read-only modes

- Status: Proposed
- Date: 2026-09-19
- Deciders: maintainer
- Spec sections affected: 5.11, 6.3, 6.4, 7.1; gates S2-G04, S2-G09, S2-G10

## Context

S2-T06 stops two instances writing one project at once (FR-PRJ-05) and makes every read-only mode visible (FR-PRJ-06). Two rules in the written guidance collide with what the gate and the heartbeat need:

- AGENTS.md rule 2 and ADR-0002 say only `packages/format` parses and serialises notebook files. `.lock` has a schema there (format-v1.md 4.7). Gate S2-G09 is a Rust test (`cargo test -p nb-fs --test lock`), and the heartbeat has to run while the webview is hidden or busy.
- Spec 6.3 lets `nb-fs` delete only under `.history`, `.trash`, `inbox` and the cache, but a lock must be removed when the project closes.

The points below were put to the maintainer before implementation and the recommended answers were chosen.

## Decision

1. **`nb-fs` reads and writes `.lock` itself**, with `serde_json`, in the layout of format-v1.md 3.5. It is a third named exception to rule 2, next to the two write exceptions of ADR-0021. Drift is guarded by one sample text: `packages/format/src/lock-sample.test.ts` checks it against the `LockFile` schema and against `JSON.stringify(…, null, 2)`, and `crates/nb-fs/tests/lock/acquire.rs` checks that `nb-fs` writes those exact bytes. Unknown keys are ignored on read (the schema is loose); a repeated key, a process id below 1, an empty or multi-line name, or a time that is not `YYYY-MM-DDTHH:MM:SSZ` makes the file unreadable.
2. **`nb-fs` may delete `_notebook/.lock`, and only that**, and only when its bytes are exactly what this instance last wrote. Nothing else is deleted, and a lock that was taken over is left in place. `create_exclusive` may also remove the lock file it has just created if writing it fails, the same narrow case as the temporary files in ADR-0020.
3. **Liveness is the heartbeat alone**, as spec 5.11 says. A heartbeat five minutes old or more is stale. A heartbeat in the future, from a clock that is ahead of ours, counts as live. The process id is never checked, which would need a dependency and is meaningless across machines.
4. **Takeover needs a confirmation flag** passed by the caller (`confirm_takeover`). It applies to a stale lock and to an unreadable one, whose remedy is otherwise to delete a file by hand. It is ignored for a live lock. A `.lock` that is a folder, a link or a read-only file is never followed, replaced or made writable; the project opens read-only with its own banner.
5. **Acquiring** creates `.lock` exclusively (`create_new`); taking over replaces it with the ordinary atomic write of ADR-0020 and then reads it back to check it is ours. A reader can see a partly written lock in the instant of creation and treats it as unreadable, which asks for confirmation rather than guessing.
6. **The heartbeat runs on a dedicated thread in `nb-fs`** (`LockGuard`), every 60 seconds, so it does not depend on the webview. Before each write it checks that the file still holds exactly the bytes this instance wrote; if not, the lock is lost and nothing is written. Three failed refreshes in a row also lose the lock: that is three minutes, inside the five it takes another instance to see the lock as stale, so this instance stops writing before anyone else may start. Dropping a guard stops the heartbeat and leaves `.lock` to go stale, as a crash would.
7. **One registry per running application** (`LockRegistry`) holds a guard per project, keyed by the resolved `_notebook` folder. Asking again for a project this process already holds keeps that lock, so a reloaded webview is not refused by its own lock. A lock that was lost is given up before asking again. Every lock is released when the application exits (`RunEvent::Exit`). Two windows on one project are FR-PRJ-04 (Should) and are not built.
8. **The webview learns of a lost lock by asking**, every 30 seconds (`project_lock_state`), rather than through Tauri events, so `capabilities/` is not touched. A failed check changes nothing.
9. **Mode.** The first applicable reason is shown, in the order of spec 6.4 step 2: newer format, invalid `project.yaml`, archived, then the lock (live, stale, unreadable, blocked, read-only medium), plus two that arise later: lock lost while open, and lock could not be asked for (read-only when unsure, P6). A project that is read-only for a reason before the lock never asks for one and nothing is written to it. A newer or invalid `project.yaml` now opens read-only instead of failing (this replaces ADR-0021 point 7); it is not remembered, because there is no project id to remember. Open and Open-recent do this; Locate still refuses a folder it cannot identify. A read-only medium is detected when creating the lock fails with `ReadOnlyFilesystem` or `PermissionDenied` (or `ERROR_WRITE_PROTECT` on Windows).
10. **Banners** state the reason and the available action (FR-PRJ-06), in `messages.ts`. A button appears only for taking over a stale or unreadable lock, and for trying again where the reason may pass. The takeover confirmation is sent only from a banner that offered it.
11. **Dependency.** `gethostname` 1.1.0, pinned, for the lock's `host` (the standard library has none). Apache-2.0, on the `deny.toml` allow-list; `cargo deny check` passes; it adds one package, and `windows-link` (already locked) on Windows. If the machine has no name the host is `unknown`. RFC 3339 formatting and parsing are about 40 lines in `nb-fs`, with property tests, so no date crate is added.

## Not in this task

- The development-build reason belongs to S7-T03 and gate S7-G03, along with "test copies". `ReadOnlyReason` has room for it.
- No command that writes project files exists yet besides the lock. Later write commands (S2-T10 onwards) must require a held lock; `LockRegistry::health` is the check.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| The webview owns the JSON and Rust only stores its text (the ADR-0021 pattern) | Keeps rule 2 pure, but a hidden or throttled webview can miss the 60-second heartbeat and the gate test would need a webview. |
| Check whether the process is alive on the same host | Needs a dependency, is wrong across machines, and the specification decides by heartbeat. |
| Read-only for an unreadable lock, with no takeover | Leaves the person stuck until they delete a file by hand. |
| Tauri events for a lost lock | Needs `capabilities/` (protected) for something polling does as well. |
| A date crate | A dependency for two small functions. |

## Consequences

- **AGENTS.md rule 2, the section 4 row for `crates/nb-fs` and spec 6.3 (the nb-fs row and its delete list) need the exceptions above.** They are protected or specification text and this change does not edit them; the maintainer must.
- **Races.** Two instances confirming a takeover in the same instant both write; the one whose lock is overwritten finds out at its next heartbeat and stops (at most a minute of overlap, and only when both were confirmed by a person). A refresh checks the file and then writes, so a takeover between the two is overwritten; the taker finds out the same way. A partly written lock is read as unreadable. Hard links to `.lock` are not detected.
- **A lock that is lost is noticed within 60 seconds by the heartbeat and 30 seconds by the check**, not instantly. Nothing writes project files yet, so nothing is at risk until S2-T10.
- **Read-only because of a read-only medium is inferred** from the failure to create the lock. It is tested with injected errors, not on a real read-only volume.
- **Tests.** `crates/nb-fs/tests/lock/` (S2-G09: acquire, live, stale, boundary, unreadable variants, future heartbeat, confirmed takeover, heartbeat, guard thread, registry, release, read-only media, timestamps and their properties), the lock scenario in `fs_safety.rs` (S2-G06), and `mode.test.ts`, `lockFlows.test.ts`, `flows.test.ts`, `messages.test.ts` and `ReadOnlyBanner.test.tsx` for the modes and banners. S2-G04 and S2-G10 name fixtures from S2-T13; their behaviour is covered with temporary projects until those exist. The command layer and the polling hook were not driven by hand.
