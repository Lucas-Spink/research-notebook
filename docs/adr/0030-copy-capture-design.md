# ADR-0030: Copy capture design

- Status: Proposed
- Date: 2026-09-22
- Deciders: maintainer
- Spec sections affected: 7.4 (FR-EVD-03 to FR-EVD-05); gate S3-G01, S3-G10

## Context

S3-T01 copies a file into `evidence/` or `methods/` as a new immutable version: hash it while copying, verify the copy, place it atomically under a Windows-safe, collision-free name, and never create a second version when the content duplicates one that already exists. Spec 7.4 fixes the outcome but leaves open where the dedupe decision lives, how a duplicate interacts with the copy-then-verify sequence, and how much of the feature this task builds versus leaves for the tasks that reuse it (S3-T02 relink, S3-T03 update from source, S3-T05 inbox import).

## Decision

1. **The dedupe decision is made inside `nb-fs`, from hashes the caller supplies, not from parsed YAML.** `ProjectRoot::capture_copy` takes `known: &[KnownVersion]` (`sha256`, `number`, and whether the version belongs to the artefact being captured for). The caller — whoever has already parsed `artefacts.yaml` — builds this list from data it already holds; `nb-fs` never parses the file itself (AGENTS.md rule 2). This keeps the whole "same content → no version; changed content → vN" rule inside one function, testable end to end with real files and real hashes (`cargo test -p nb-fs -- capture`), rather than split across an IPC round trip.
2. **Order: copy and verify first, decide second.** The file is always streamed into a temporary file in the destination folder and hashed while copying (FR-EVD-03), then read back to verify size and hash. Only then is it compared against `known`. A same-artefact match discards the temporary file and returns `Duplicate`; nothing is ever placed for a duplicate. A different-artefact match still places the file, but is reported back (`matches_other_artefact`) so a caller can warn (FR-EVD-05's second clause). This does one extra temporary-file write for a capture that turns out to be a duplicate, in exchange for a single, simple sequence with no separate "hash only" pass over the source.
3. **Naming.** A new artefact's first version is `sanitise(original_file_name)` (spec 9.2 rules, NFC, ≤64 characters, idempotent — `names::sanitise` and `names::is_windows_safe` are now public, matching the API `docs/testing-guide.md` already sketched), resolved against a case-folded listing of the destination folder with `-2`, `-3`, ... suffixes until free (FR-EVD-04). A later version is named `<stem>.v<number><extension>` from a stem and extension the caller already knows (the first version's own file name, split at its extension) and must not already exist — versions are immutable, so nothing already at that name is ever replaced; a collision there is an error, not a name to work around.
4. **Scope: the engine only, not a live caller yet.** This task ships `nb-fs::capture` and `packages/format`'s `applyCapture` (given a capture nb-fs already placed, adds an artefact or a version to a parsed `ArtefactsFileModel`, validated the way `editExperiment` validates its own edits). Neither is wired to a Tauri command, IPC binding or UI. `NotebookState`/`Plan` (`packages/format/src/notebook/types.ts`) has no notion of `artefacts.yaml` yet, and wiring drag-and-drop or a file picker (FR-EVD-01) is not named in this task's definition of done. A later task decides how the frontend gets from "user dropped a file" to the `known` list and the `CaptureTarget` this ADR's two functions expect.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Two-phase IPC: `stage` (hash to a temp file) then `place` or `discard`, decided in TypeScript | Correct in principle (TypeScript already knows every existing hash), but adds a temp-file handle that must survive across two IPC calls, with its own crash-recovery story, for no behavioural difference from deciding inside one Rust call given the same data. |
| Decide dedupe in `packages/format` before calling Rust at all | Impossible without a separate "hash the source" pass, since the new file's hash is not known until it is read; that pass would either duplicate the copy-and-verify work or skip verification for a file that is about to be discarded. |
| Collision-walk `<stem>.vN<ext>` the same way as a first version | Version numbers are already unique and never reused (spec 5.8); a name already there means something unexpected happened, not an ordinary case to paper over. |
| Fold "matches a different artefact" into a hard refusal | FR-EVD-05 asks for a warning, not a block; the caller (with the UI this task does not build) decides what to do with `matches_other_artefact`. |

## Consequences

- **A duplicate capture still does a full copy and hash of the source into a temporary file before being discarded.** Cheap relative to the read of the source itself, and it is what lets the same function verify a genuine new version's bytes before deciding anything.
- **`known` is plain data, not the artefact list.** A future integration builds it from whatever it has already parsed; nothing in `nb-fs` needs to change if `artefacts.yaml` grows new fields.
- **No capture happens from the UI yet.** `applyCapture` and `capture_copy` are complete and tested in isolation; the next task that needs capture (S3-T02 or a dedicated wiring task) adds the Tauri command and, if it wants `NotebookState` to hold `artefacts.yaml`, extends `types.ts`.
- **Tests.** `crates/nb-fs/tests/capture.rs` (naming, collision suffixes, version naming, both dedupe clauses, refusing to replace an existing version, and a fault-injected corrupted write caught by verification), `crates/nb-fs/tests/filename_sanitise.rs` (S3-G10), the extended S2-G06/S3-G03 scenario in `fs_safety.rs`, and `packages/format/src/notebook/capture.test.ts` plus `capture.property.test.ts` (S3-G01).
