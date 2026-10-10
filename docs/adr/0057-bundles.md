# ADR-0057: Bundles are ZIP64 files saved outside the project, through one narrow `nb-fs` write

- Status: Proposed
- Date: 2026-10-10
- Deciders: maintainer
- Spec sections affected: 7.12 (FR-ARC-08), 6.5, 6.1; AGENTS.md rule 1
  (maintainer approval needed, see Consequences); builds on ADR-0051 to ADR-0056

## Context

S6-T08 creates "a notebook bundle (`_notebook/` only) and a full archive (whole
project) as ZIP64 files with a registered extension; store already-compressed
formats without recompression; warn when the destination is FAT32"
(FR-ARC-08, Must). A bundle is something a person moves to another disk, emails
or hands to a supervisor, so it cannot live inside the project: a full archive
would contain itself. Every earlier export (manifest, git bundles, HTML,
machine-readable, PDF) is written under `_notebook/exports/`, which satisfied
AGENTS.md rule 1 and spec P2 ("nothing outside `_notebook/`"). A bundle cannot.
The spec does not say where a bundle goes, what the extension is, or how the
FAT32 warning is decided.

## Decision

1. **Not a format change.** A bundle is a derived export. Nothing in
   `_notebook/` changes: no version increment, migration or fixture. The
   project is only read, so a read-only project can be bundled.
2. **One new, narrow write outside the project.** `ProjectRoot::write_new_outside`
   (`nb-fs`, new module `export`) creates one file in a folder the person chose.
   - The folder is picked in a native dialog opened from Rust; the webview holds
     only the file name that comes back (AGENTS.md rule 8).
   - The folder is resolved first and refused (`InsideProject`) if it is the
     project or anywhere below it, so a link or junction into the project is
     caught. Nothing is written in that case.
   - The name must be one ordinary, non-hidden Windows-safe file name.
   - The file is built under a temporary name in the same folder, flushed, and
     renamed only when complete. A failure removes the temporary file.
   - An existing file is never replaced: a taken name becomes `name (2).nbk`,
     `name (3).nbk`, and so on. The check and the rename are two steps, so a
     file made by another program between them could be replaced. Hard links,
     which would close that gap, are missing on FAT and exFAT drives, which are
     where bundles are often copied.
   - This is a third named exception beside the hygiene files and the settings
     file (ADR-0021). The `nb-fs` header documents it and `fs_safety.rs` runs it
     in the S2-G06 scenario.
3. **Extension and kind.** Both kinds use `.nbk`, the registered extension.
   A marker entry, `NOTEBOOK-BUNDLE.json`, says which it is
   (`{"bundle_version":1,"kind":"notebook"|"archive"}`). The extension is a
   placeholder pending the open question in spec 15.2 (application name and bundle
   extension); changing it is one constant (`BUNDLE_EXTENSION`). Registering
   the operating-system file association is S7-T09, not this task.
4. **Contents.** The notebook bundle holds every file under `_notebook/`. The
   full archive holds every file of the project folder. Both leave out the
   project lock (`_notebook/.lock`) and half-written temporary files
   (`.*.tmp`), which are not part of the record. Paths inside are
   project-relative with `/`. A link or junction is never followed and is
   counted as skipped, so nothing outside the project can enter an archive.
5. **Linked files.** A linked artefact is recorded in place, outside the project
   (spec 5.8), so an archive cannot hold it. A full archive carries
   `LINKED_FILES.txt` listing each one (experiment, name, root identifier, path;
   never a machine path). `packages/format` (`linkedFilesList`) builds the text
   and Rust stores it, so Rust still does not read `artefacts.yaml`
   (AGENTS.md rule 2). Extra entries are accepted only as plain forward paths
   and may not take the name of a project file.
6. **Compression.** Files whose extension marks an already-compressed format
   (images, PDF, ZIP, gzip, bzip2, xz, zstd, audio, video, Office, `.bundle`) are
   stored; everything else is deflated. The list is a constant in `nb-archive`,
   matched without regard to case. Entries larger than 4 GiB use the ZIP64
   structures, as does an archive whose total passes 4 GiB or 65,535 entries.
7. **Checked before it is kept.** After writing, the file is read back from the
   start. Every entry is decompressed and its SHA-256 and length compared with
   what was read from the project. A file whose length changed while it was
   being read (`SourceChanged`) stops the bundle, because it would not match
   what the plan showed. Any failure keeps nothing.
8. **FAT32 warning.** Detecting a FAT32 volume needs a system call, and the
   workspace forbids `unsafe`; the safe crates that do it (`sysinfo`) are large.
   Instead:
   - the panel counts the files first and warns before anything is saved when
     the total is 4 GiB or more (`exceeds_fat32_limit`, a conservative bound,
     since deflating can only shrink it); and
   - a destination that refuses the file (`FileTooLarge`, `EFBIG`,
     `ERROR_FILE_TOO_LARGE`) is reported as "usually FAT32", with nothing kept.
   A FAT32 drive that would still have fitted the archive is not warned about,
   and a large archive on a drive that can hold it is warned about without need.
   If a precise check is wanted later, add a volume-information crate with the
   section 7 checklist.
9. **Modification times.** Each entry keeps the file's modification time (UTC,
   to two seconds, 1980 to 2107), so an unpacked archive keeps its dates. A time
   the format cannot hold is left at the format's default.
10. **No lock, no progress.** Nothing in the project is written, so the command
    needs no project lock. It runs on a blocking thread. There is no progress or
    cancel once the destination is chosen; a very large archive blocks the panel
    until it ends. The count shown beforehand is the only size information.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Write bundles under `_notebook/exports/bundles/` | A full archive would contain its own earlier archives (needs an exclusion), the person would still have to copy the file out, and a FAT32 warning would concern the wrong drive. Keeps rule 1 unchanged, which is its one merit. |
| Let the webview pick a path and pass it back | The webview must never hold paths it was not given (rule 8). |
| Overwrite an existing bundle | The application never deletes or replaces what a person may have kept (rule 1 spirit). |
| Detect FAT32 with `sysinfo` or a hand-written system call | `unsafe` is forbidden; `sysinfo` is a large dependency for one warning. Size-based warning plus a refusal mapping covers the harm. |
| Two extensions (`.nbk`, `.nba`) | A marker entry is enough and needs one registration. Can be split later without a format change, since the marker is already there. |
| Hard-link the finished file to its final name | Atomic and never replaces, but fails on FAT and exFAT. |

## Consequences

- **New dependency.** `zip` 9.0.1 (MIT), pinned exactly, default features off,
  `deflate-flate2-zlib-rs` only. It adds `zip`, `typed-path`, `nix` and
  `cfg_aliases` to `Cargo.lock`, all permissive; `cargo deny check` passes.
  `sha2` (already in the lockfile) is added to `nb-archive`.
- **Maintainer approval needed for AGENTS.md rule 1 and spec P2.** Their text
  says nothing outside `_notebook/` is written. Proposed wording: add to rule 1
  "except one new bundle file in a folder the person chose, outside the project
  (ADR-0057)", and to the `nb-fs` row of spec 6.3. Neither file is edited in this
  change.
- **Protected paths.** `crates/nb-fs/`, `crates/nb-archive/`, this ADR, and
  `.github/workflows/nightly.yml` (a job for S6-G04).
- **Tests.** `nb-fs/tests/export.rs` (listing, links, name and folder checks,
  no replacement, failed producer), `nb-fs/tests/fs_safety.rs` (S2-G06 scenario),
  `nb-archive/tests/bundle.rs` (contents, markers, extras, stored versus
  deflated, times, project unchanged, inside-project refusal, round-trip
  property, extraction and checksum match, FAT32 bound),
  `nb-archive/tests/zip64.rs` (S6-G04, over 4 GiB, `--ignored`, nightly),
  `commands/projects/bundle.rs`, `linkedFiles.test.ts`, `model/bundle.test.ts`
  and `BundlePanel.test.tsx`.
- **Not tested.** A real FAT32 drive (the refusal mapping is unit-reasoned, not
  observed), macOS, symbolic links on Unix (junctions were tested on Windows),
  a file changing mid-read (the check is by length only), cancelling the
  destination dialog at the operating-system level, and opening a bundle
  directly from the application (FR-PRJ-02 is not in S6; tests extract the
  archive and open the folder).
- **Windows only.** Everything here was run on Windows.
