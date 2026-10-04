# ADR-0051: The manifest lists captured files as they are on disk

- Status: Proposed
- Date: 2026-10-04
- Deciders: maintainer
- Spec sections affected: 7.12 (FR-ARC-02), 5; gates S2-G06, S6-G03

## Context

S6-T02 writes `exports/manifest.csv` with relative path, size, modification
time, SHA-256, experiments and groups "for every artefact file". S6-T03
(Verify) will re-hash files against it, so it must say what is on disk, and
must never look complete when it is not.

The spec does not settle which files count, how a file in several groups is
written, where the modification time comes from, or what happens when a file
is missing or differs from `artefacts.yaml`.

## Decision

1. **Not a format change.** `exports/` is not notebook data (format-v1.md
   4.8) and is never parsed by `packages/format`. The manifest is a derived
   export that can be regenerated, so there is no version increment, migration
   or fixture. It keeps no history: each run replaces the last.
2. **Which files.** Every captured version file (`versions[].file`) of every
   copied artefact. Linked artefacts are outside the notebook (ADR-0050 §2)
   and are not listed, so Verify will not report them.
3. **Columns.** `path,size,modified,sha256,experiments,groups`, in that order.
   - `path`: project-relative, beginning `_notebook/`, `/` separators, the
     same form as the integrity check's paths.
   - `modified`: the file's own modification time, UTC to the second
     (`2026-09-05T09:40:52Z`), not `captured` from `artefacts.yaml`.
   - `experiments`: the ref of the experiment holding the file.
   - `groups`: the path of every group the artefact is in, such as
     `Figures/QC`, in tree order, joined with `;`. A group name containing `/`
     or `;` makes the column ambiguous; it is informational and Verify does not
     read it.
4. **Text.** RFC 4180 quoting, LF line endings, a header, rows sorted by path,
   so the same project gives the same bytes. Cells that begin `=`, `+`, `-`,
   `@`, tab or CR are prefixed with `'`, because group names are the person's
   own text and the file is likely to be opened in a spreadsheet.
5. **What is on disk wins.** Size and SHA-256 are computed from the file when
   the manifest is made, not copied from `artefacts.yaml`. A difference from
   the notebook's record is reported to the person, and the row carries the
   hash the file has now. A file that is missing or unreadable gets no row and
   is reported; a file nobody asked about counts as unreadable. If the files
   cannot be asked about at all, nothing is written, because an empty
   manifest would read as an empty archive.
6. **Where the code is.** `packages/format/src/notebook/manifest.ts` builds
   rows and CSV (pure; rule 2). `ProjectRoot::observe_version_file` in `nb-fs`
   opens a file through `open_version_file`, so the same confinement applies,
   and reads it once in 64 KiB blocks. Two commands, `observe_version_files`
   (read-only, answers by position) and `write_manifest` (needs the project
   lock; fixed path), are in `commands/projects/archive.rs`. The crate
   `nb-archive` does not exist yet and is not created here.
7. **Independent of the integrity check.** The manifest can be generated
   whatever the check found. The panel warns when the check has findings open
   or has not been run, because acknowledgements are session-only (ADR-0050 §3).
8. **Where it is shown.** Beneath the integrity check in the same Project-tab
   pane, since the manifest follows it. No new pane kind.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Copy size and hash from `artefacts.yaml` | A manifest that repeats the record cannot reveal a changed file, which is the point of Verify. |
| Refuse to write if any file is missing or differs | An archive with an acknowledged missing file could then never get a manifest. Reporting is safer than blocking. |
| Include linked files | They are outside the notebook and an archive will not hold them; Verify would fail on every machine without the data. |
| `captured` as the modification time | The spec says modification time; `captured` is when the app copied it. |

## Consequences

- **Tests.** `manifest.test.ts` and `manifest.property.test.ts` (rows equal an
  oracle by construction, every cell survives CSV), `generate.test.ts`,
  `ManifestPanel.test.tsx`, `observe_version_file.rs` (known hashes, large and
  empty files, refusals, nothing changes, proptest), the command tests in
  `archive.rs`, and the filesystem safety scenario `fs_safety.rs`, which now
  hashes a file, writes `exports/manifest.csv` and is refused outside
  `_notebook/`.
- **Protected paths.** `crates/nb-fs/` and this ADR.
- **Windows only.** Everything here was run on Windows.
