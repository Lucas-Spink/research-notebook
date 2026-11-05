# ADR-0067: Import inbox requests while the project is open

- Status: Proposed
- Date: 2026-11-05
- Deciders: maintainer
- Spec sections affected: 5.10, 7.10 (FR-VSC-04, FR-VSC-07)
- Amends: ADR-0033, ADR-0034, ADR-0044 point 6

## Context

ADR-0044 point 6 imports the inbox once, when a writable project opens. A file added from the VS Code extension while the project is already open therefore sat in `_notebook/inbox/` until the next open, and nothing in the application showed it. The extension also asked three questions (experiment, role, mode) for every file, which works against its purpose of saving steps.

## Decision

1. **Poll the inbox while a project is open and writable.** Every 1.5 s the notebook hook lists `_notebook/inbox/` (`importNewInboxRequests`) and, if a request it has not already judged invalid is waiting, runs the existing import. Polling matches the change watcher (ADR-0024 point 7), so `capabilities/` and the Rust watcher (which deliberately ignores `inbox/`) are untouched.
2. **Invalid requests are not retried.** A request left in the inbox with a reason is remembered by folder name and skipped on later ticks. It is forgotten once it leaves the inbox.
3. **Serialised with edits.** Each look goes through the hook's existing queue, and the notebook state is read fresh for every request, as on open.
4. **Read-only windows do not import.** Unchanged from ADR-0044.
5. **Extension: one click.** The Explorer and editor-tab menus offer "Add to STRATA as result", "as method" and "as link (no copy)". Result and method use automatic mode (FR-VSC-04's defaults); link forces link mode with the role result. The experiment is still asked for, except when the project has only one. The original command stays in the Command Palette as a result in automatic mode. The confirmation now says the file imports within a couple of seconds if the project is open (FR-VSC-07).

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Watch `inbox/` in `nb-fs` and push Tauri events | Needs a protected capability entry and a Rust change for what polling does within 1.5 s. |
| An "accept" step in the application | Adds a step to a feature meant to remove them; the import is already validated and non-destructive. |
| Remember the last experiment instead of asking | Hidden state; not requested. |

## Consequences

- One directory listing every 1.5 s per open writable project; nothing else when the inbox is empty.
- Latency from click to artefact is up to about 1.5 s plus the import itself.
- Tests: `model/inbox-open.test.ts` (`importNewInboxRequests`) and `useNotebook.inbox.test.tsx` (fake timers). Not verified by hand in the running application when this was written.
