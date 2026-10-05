# ADR-0052: Verify re-hashes the manifest's files and never reports a pass it did not earn

- Status: Proposed
- Date: 2026-10-05
- Deciders: maintainer
- Spec sections affected: 7.12 (FR-ARC-03); gate S6-G03

## Context

S6-T03 re-hashes files against `exports/manifest.csv` (ADR-0051) and reports
differences. The spec does not say who reads the CSV, what counts as a
difference, or what Verify says when it cannot check.

## Decision

1. **Not a format change.** `manifest.csv` is a derived export (ADR-0051 §1).
   Verify reads it and writes nothing, and needs no project lock, so an
   archived or read-only project can be verified.
2. **One parser.** `packages/format` reads the CSV (`parseManifest`), strictly:
   exact header, whole-number size, 64 lower-case hex digits, a captured-file
   path, no duplicates. Anything else is an error, never a shorter list,
   because a short list would let Verify pass files it never checked. Rust
   never reads the CSV; it receives path, size and hash.
3. **The comparison.** `nb-archive::verify` observes each file through
   `nb-fs::observe_version_file` (same confinement as previews) and compares
   size and SHA-256. Modification time is not compared: copying an archive
   changes it without changing bytes. A manifest path that is not a captured
   file's path is reported as unreadable.
4. **Verdicts.** `matches`, `missing`, `unreadable`, `differs` (with whether
   the size changed, the hash changed, or both).
5. **Files the manifest does not list.** The notebook's captured files absent
   from the manifest are reported separately, since they were captured after
   it was made and Verify cannot vouch for them. Listed files absent from the
   notebook's record are not reported: the manifest is the reference.
6. **No false pass.** A missing, unreadable or malformed manifest, a failed
   command or a short answer is a failure with its own message. "Every listed
   file matches" appears only when every listed file matched and none is
   unlisted.
7. **Linked files** are outside the notebook and not in the manifest
   (ADR-0050 §2, ADR-0051 §2), so they are not verified.
8. **Where the code is.** New crate `nb-archive` (`verify`), depending only on
   `nb-fs`; `ProjectRoot::read_manifest` in `nb-fs`; commands `read_manifest`
   and `verify_manifest_files` in `commands/projects/verify.rs`; the panel
   follows the manifest in the Project tab's integrity pane.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Parse the CSV in Rust | Breaks "one parser" (AGENTS.md §2.2) for little gain. |
| Compare modification times | Changes on every copy; would flag every moved archive. |
| Skip unparseable lines | Verify would pass files it did not check. |

## Consequences

- **Tests.** `crates/nb-archive/tests/verify.rs` (S6-G03: a flipped byte in
  any file is reported, nothing else is; missing, size change, bad path, no
  writes), `manifestParse` unit and property tests, `verify.test.ts`,
  `VerifyPanel.test.tsx`, command tests in `verify.rs`, `nb-fs` read test.
- **Protected paths.** `crates/nb-archive/` (new), `crates/nb-fs/`, this ADR.
- **Windows only.** Everything here was run on Windows.
