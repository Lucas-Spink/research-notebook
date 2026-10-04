# ADR-0050: The integrity check reads loaded state plus two read-only checks

- Status: Proposed
- Date: 2026-10-04
- Deciders: maintainer
- Spec sections affected: 7.12 (FR-ARC-01), 5.8, 5.9; gates S6-G06

## Context

S6-T01 lists missing files, unresolved references, external files, and
missing or trashed sources, "each to be resolved or acknowledged". Archiving
(S6-T02 onwards) depends on this report, so it must never alter a notebook
file, and it must not answer "clean" when it could not look.

Three things are not settled by the spec: what counts as each finding, where
an acknowledgement is kept, and how the filesystem is asked about captured
files, which no existing command checks.

## Decision

1. **Report.** `packages/format/src/notebook/integrity.ts` adds
   `buildIntegrityReport`, a pure function over `Arranged`, the cached
   bibliography and a set of observations. `versionFilesOf` and
   `linkedArtefactsOf` list what the caller must ask the filesystem about, so
   the package does no I/O.
2. **What counts.**
   - *Missing file*: a captured version whose file cannot be opened as a
     regular file; "unreadable" is kept apart from "missing".
   - *Unresolved reference*: an artefact reference whose artefact exists in
     no experiment's `artefacts.yaml`, or whose pinned version does not
     exist. Found with the editor's own parser, so code fences are skipped
     (AGENTS.md rule 2). When some `artefacts.yaml` could not be read, the
     finding says the artefact may be in it, and that file is itself reported.
   - *External file*: every linked artefact, with its live availability
     (ADR-0031 §1). It is a finding even when available, because a linked
     file is outside the notebook and an archive will not hold it.
   - *Source problem*: a stored source that is trashed or missing, and a
     citation (Methods or Interpretation, as in ADR-0049) whose citekey is not
     in `bibliography.json`.
3. **Acknowledgement is session-only.** The webview keeps the keys of
   acknowledged findings in memory. A key is stable for the same problem, so
   it survives running the check again and is dropped when the problem goes.
   Nothing is written, so the on-disk format is unchanged (AGENTS.md rule 3).
   Archiving must therefore ask again rather than trust an earlier
   acknowledgement.
4. **Captured files** are checked by one new read-only command,
   `check_version_files`, which takes validated `VersionPath`s and answers by
   position, so no path or system text comes back. It opens each file through
   `ProjectRoot::open_version_file` and writes nothing. The command is in
   the preview module because it shares its project-opening and error
   mapping.
5. **Failure is not clean.** If the captured files cannot be checked the
   check fails with a message. A linked file whose check fails is shown as
   not checked.
6. **Resolve reuses existing flows.** A finding links to the experiment's
   Results (relink), the experiment's section (update reference) or the
   Sources list (repair, refresh). No repair logic is added. A linked file's
   hash is not checked, as in FR-EVD-07.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Persist acknowledgements in `project.yaml` | A format change needing a version increment, migration and approval; nothing yet requires durability. |
| Read every version file through `readNotebookFile` | It returns text and hashes; far too heavy for existence. |
| Add the check to `nb-index` | The index must not parse notebook files (ADR-0042, ADR-0049). |

## Consequences

- Acknowledgements are lost when the project closes. S6-T02 and later must
  not treat them as durable.
- A linked file that is available is still listed, which makes the report
  non-empty for most real projects; the person acknowledges it once a session.
- **Tests.** `integrity.test.ts`, `integrity.property.test.ts` (the report
  equals an oracle built by construction), `collect.test.ts`,
  `resolution.test.ts`, `IntegrityPanel.test.tsx`, and the Rust tests for
  `version_file_problems`, including that nothing is changed.
- **Windows only.** Everything here was run on Windows.
