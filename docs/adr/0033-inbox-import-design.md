# ADR-0033: Inbox import design

- Status: Proposed
- Date: 2026-09-23
- Deciders: maintainer
- Spec sections affected: 5.10; gate S3-G03, S3-G04

## Context

S3-T05 imports `_notebook/inbox/<ULID>/` requests (spec 5.10): validate,
match the request's `source` to an existing artefact (a new version if the
hash differs) or create a new artefact, move a copy-mode payload into place,
and remove the request folder; an invalid request stays put, listed with an
error. `InboxRequest` (Zod schema) and `parseRequest`/`serialiseRequest`
already existed from S2-T01/T02 — request.json's shape was already
validated. What this task adds is the import decision and mechanics, and
four points the spec states as outcomes but leaves open as mechanism.

## Decision

1. **Scope: the engine only, matching ADR-0030 §4 and ADR-0031 §5's
   boundary.** This task ships `nb-fs::inbox` (`list_inbox_requests`,
   `read_inbox_request`, `import_inbox_payload`, `remove_inbox_request`) and
   `packages/format`'s `planInboxImport` (given a request's raw text and an
   experiment's already-parsed `ArtefactsFileModel`, decides what to do).
   Neither is wired to a Tauri command, IPC binding, or the project-open flow
   (spec 6.4 step 6) — `NotebookState` still has no notion of
   `artefacts.yaml`, and mapping `request.experiment_id` to the right
   experiment folder is the same project-loader responsibility ADR-0031
   left for external-root resolution. `planInboxImport` stops at a plan; it
   never calls `applyCapture`/`applyLink`/`applyRelink` itself, the same
   "decide, then record" split those two ADRs already established.
2. **A copy-mode payload is verified in place, then copied, never moved
   directly.** `import_inbox_payload` hashes and stats the payload with
   `nb-fs`'s existing `observe_link` before touching anything, and refuses
   with `PayloadMismatch` if that does not match the request's declared
   `sha256`/`size` — a corrupted or tampered request is left completely
   untouched for the caller to list as invalid, per spec 5.10. Only then does
   it call `capture_copy_with` with the inbox file as the source, reusing
   100% of S3-T01's naming, collision and dedupe logic unchanged. This copies
   the bytes a second time (inbox → temp → `evidence/`/`methods/`) rather
   than renaming; `remove_inbox_request` is what actually deletes the inbox
   copy, once the caller has recorded the import. Slightly less efficient
   than a rename, but it adds no new placement code and keeps capture's
   "never partial" guarantee intact for this path too.
3. **A processed request folder is deleted outright, not trashed.**
   `remove_inbox_request` calls `fs::remove_dir_all` after confining the
   path to `_notebook/inbox/<request_id>`. Spec 5.10 says "removes the
   request folder", and the inbox is already ephemeral, gitignored system
   state (spec 5.12) like `.lock` or a stray `.tmp` write remnant, not a
   document a person made — the same reasoning `.lock` and `.tmp` cleanup
   already use, not the one `.trash/` (FR-EXP-06, FR-EVD-10) uses for things
   a person created.
4. **A new artefact's `type` and display name are inferred, not requested.**
   request.json (spec 5.10) carries neither field, though a new artefact
   (spec 5.8) needs both. `planInboxImport` infers `type` from the payload's
   (or, for link mode, the source path's) file extension via a small,
   deliberately minimal map in `packages/format/src/notebook/inbox.ts`,
   defaulting to `"other"`; the display name defaults to the filename
   without its extension, the same default FR-EVD-11 already gives a person
   editing a display name by hand. This mapping is provisional: S3-T10
   (previews, spec 8) owns the canonical extension mapping and may refine or
   replace it.
5. **A link-mode observation is built from what the request already
   declares, never a fresh read of the source.** `artefacts.yaml`'s `link`
   object needs `sha256`, `size` and `observed_mtime` (spec 5.8), but
   request.json has no mtime, and re-stating the file needs resolving
   `source.root`/`source.path` against external roots — the project
   loader's job, per ADR-0031 §5. `planInboxImport` uses
   `request.sha256`/`request.size`/`request.created` directly as the
   observation. Availability and staleness are then exactly what the
   existing FR-EVD-07 "on open" check already handles, once something calls
   it; nothing new is needed here.
6. **`group_path` is accepted but not acted on.** The field is already
   permitted by the `InboxRequest` schema (S2-T01); an artefact created from
   an inbox request imports ungrouped. Virtual groups (S3-T08) do not exist
   yet — no tree, no create-or-nest logic — so there is nothing to place it
   into. The same kind of deferral ADR-0031 made for external roots.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Rename the payload directly from `inbox/` into `evidence/`/`methods/` instead of copying | Saves one read+write, but duplicates capture's naming/collision/verification logic for a second, subtly different code path instead of reusing S3-T01's proven one; the extra copy is cheap next to the read the source file already needs. |
| Trash the processed request folder | Spec 5.10 says "removes", not "moves aside"; the inbox is the application's own working state, not a user document — nothing this project trashes today (`.lock`, `.tmp` remnants) is either. |
| Require `type`/`name` as new request.json fields | A format change (AGENTS.md rule 3: version bump, migration, fixtures, maintainer approval) for values derivable from the filename the request already carries. |
| Resolve external roots now to get a live `observed_mtime` | Reaches into territory ADR-0031 deliberately left to the project loader, for a value the spec's own "on open"/"on demand" checks (FR-EVD-07) already exist to keep current later. |
| Refuse a request with a non-empty `group_path` as invalid | Groups (S3-T08) are a real, planned feature, not a rejected one; refusing the whole request for a field the schema already allows would make every VS Code capture with a group hint fail until S3-T08 ships, for no safety benefit. |

## Consequences

- **A copy-mode import briefly holds two copies of the payload's bytes**
  (the inbox folder and the new version), until the caller calls
  `remove_inbox_request`. Acceptable: nothing partial is ever visible, and
  the inbox copy is deleted, not left to drift.
- **The inferred `type` can be wrong for an unusual extension** (anything
  not in `EXTENSION_TYPES` becomes `"other"`). A person can already correct
  a display name by hand (FR-EVD-11); correcting a wrong type is not yet
  possible anywhere in the app and is not part of this task's scope.
- **A link-mode artefact's `observed_mtime` reflects when the extension
  captured it, not when the app imported it.** Consistent with treating
  `created` as the observation time; the existing availability check still
  runs against the live file whenever something calls it.
- **Tests.** `crates/nb-fs/tests/inbox_import.rs` (listing, `.tmp` exclusion,
  payload verification and mismatch, removal, and the "written with no app
  running" round trip — gate S3-G04), the extended S2-G06/S3-G03 scenario in
  `fs_safety.rs`, and `packages/format/src/notebook/inbox.test.ts` (schema
  and business-rule invalidity, matching, type/name inference, plan shapes
  for copy, link and re-link).
