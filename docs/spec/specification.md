**Computational Research Notebook**

Technical Specification

Version 0.1, draft for implementation

15 September 2026

Licence: AGPL-3.0-or-later

| **Version** | **Date** | **Change** |
|----|----|----|
| 0.1 | 15 September 2026 | Initial specification consolidating the design brief and design review: plain-file project format, evidence capture, archive, safeguards, cross-platform rules and test strategy. |

Companion files: Development_Stages_and_Test_Gates.xlsx, AGENTS.md,
repository starter kit.

Contents

1\. Introduction

1.1 Purpose of this document

This specification defines the behaviour, on-disk format, architecture
and verification requirements for the first release of the Computational
Research Notebook. It is the reference for every human and AI
contributor. Where the code and this document disagree, this document is
correct until an Architecture Decision Record (ADR) changes it and the
document is updated in the same pull request.

The companion workbook Development_Stages_and_Test_Gates.xlsx breaks
implementation into stages with the tasks and tests that must pass
before each stage closes. The repository file AGENTS.md sets the rules
AI coding agents follow.

1.2 Product summary

The notebook is a desktop application for computational research. It
connects research questions, experiments, captured evidence files,
observations, scientific interpretation and literature. A **project** is
a folder of plain files, in the same way an Obsidian vault is a folder
of notes. The application presents the project as a table with one row
per experiment, grouped under research questions, with columns for
Motivation, Methods, Results, Results Notes, Interpretation and
Literature.

The files are the record. The application is an editor, viewer and index
over those files. Every note, reference, artefact record and cached
citation remains readable in a text editor, and renderable with Pandoc,
if the application is unavailable.

1.3 Users

| **User** | **Context** | **Primary needs** |
|----|----|----|
| Primary: computational researcher or student | Works locally with scripts, notebooks, figures and tables, usually in VS Code; manages references in Zotero; uses Windows or macOS, often both. | Record why an analysis was run, what it found and which evidence supports each interpretation; find it again months later. |
| Secondary: future reader | The researcher years later, a supervisor, an examiner or a colleague opening an archived project on a different computer, possibly without the application. | Read the complete record, see the evidence as it was when interpreted, and verify files have not changed. |

1.4 Goals for the first release

- Local projects stored as plain files, portable between computers and
  between Windows and macOS.

- Questions and experiments presented as a grouped table with an
  expanded editing view.

- Evidence captured into the project as immutable versions, with linking
  for files above a size threshold.

- Nested virtual groups with multiple memberships per artefact.

- Rich-text Methods, Results Notes and Interpretation with inline
  references to evidence.

- Zotero citations in Methods and Interpretation with an automatically
  generated Literature section.

- Capture from VS Code through a companion extension.

- Automatic history, conflict handling and read-only safe modes that
  protect the record.

- Archive, verification and static export to HTML and PDF/A.

1.5 Non-goals for the first release

- Cloud synchronisation, real-time collaboration or multi-user editing.

- Access to files on remote machines over SSH.

- Managing raw sequencing data or other very large datasets beyond
  linking and checksums.

- Rendering Jupyter notebook contents, or previews of specialist formats
  such as h5ad, loom or BAM.

- Citations in Motivation, references across experiments, and project
  bibliographies outside archive export.

- Writing changes back to Zotero.

- Linux builds (the code should not prevent them).

1.6 Normative language

**Must** marks an absolute requirement. **Should** marks a requirement
that may be deferred only with a recorded reason. **May** or **Could**
marks an optional capability. Requirement priorities in tables use Must,
Should and Could with the same meanings.

2\. Design principles

Every design and implementation decision is checked against these
principles. A change that violates one requires an ADR approved by the
maintainer.

| **ID** | **Principle** | **Rule** | **Consequence** |
|----|----|----|----|
| P1 | Files are the record | All research content lives in human-readable files inside \_notebook/. Databases hold only derived data. | Deleting the index loses nothing. A broken release cannot make notes inaccessible. |
| P2 | Analysis files are never modified | The application never writes, moves, renames or deletes files outside the project's \_notebook/ folder. | Scripts, results and data are safe from application bugs. |
| P3 | Readable without the application | The format uses standard Markdown, Pandoc citation syntax, YAML and CSL-JSON. | Notes open in VS Code, Obsidian and Pandoc. |
| P4 | Evidence is frozen at capture | Captured files are immutable versions; new content creates a new version. | An interpretation always points to the evidence it describes. |
| P5 | Stable identity | Projects, questions, experiments, artefacts and groups carry ULIDs. Human references such as EXP-042 are labels. | Renaming, moving and reordering never break relationships. |
| P6 | When unsure, read-only | Parse errors, locks, newer formats, archived projects and development builds open projects read-only. | The application never overwrites content it does not fully understand. |
| P7 | Local and offline | No network access except Zotero on localhost and opt-in update checks. | Works on a plane; no telemetry. |
| P8 | Windows and macOS are equal | Every feature is built and tested on both platforms before a stage closes. | Projects move between operating systems without repair. |
| P9 | One implementation per concern | Notebook files are parsed and serialised only by packages/format. | The app, VS Code extension and exporters cannot disagree about the format. |

3\. Terminology

| **Term** | **Definition** |
|----|----|
| Project | A folder containing a \_notebook/ directory. The unit that is opened, moved and archived. Equivalent to an Obsidian vault. |
| Project root | The folder that contains \_notebook/. Relative source paths are resolved from it. |
| Question | A research question, rationale or hypothesis. Its body is the Motivation shared by its experiments. |
| Experiment | One analysis within a question. Stored as experiments/\<ref\>/experiment.md with its artefact record and evidence. |
| Ref | A human-readable label: Q-### for questions, EXP-### for experiments. Unique within a project and never reused. |
| Artefact | A file recorded against an experiment, with a display name, role, mode and history. |
| Role | result (appears in Results and may be grouped) or method (a script or notebook shown under Methods). |
| Mode | copy: the file is captured into the project as versions. link: the file stays in place and is recorded by path and checksum. |
| Version | One immutable captured copy of an artefact's content, numbered from 1. |
| Source | The original location of an artefact's file, relative to the project root or an external root. |
| Capture | The act of recording a file as an artefact or as a new version of one. |
| Evidence | Captured result files, stored under evidence/. |
| Group | A named node in an experiment's virtual tree that contains artefact IDs and nested groups. Groups never affect real files. |
| Membership | An artefact ID listed in a group. An artefact may be a member of several groups. |
| Ungrouped | Result artefacts that are not a member of any group. |
| Reference | An inline link from narrative text to an artefact version. |
| Citation | An inline Pandoc citation to one or more bibliographic sources. |
| Source (bibliographic) | A Zotero item identified by a citekey, cached as CSL-JSON in bibliography.json. |
| Citation context | The ordered set of citations processed together to produce numbering and disambiguation. One per experiment in this release. |
| Literature | The bibliography generated from an experiment's citation context and written into its experiment file. |
| Inbox | \_notebook/inbox/, where the VS Code extension places capture requests for the application to import. |
| Index | A SQLite database in the application cache directory containing only data derived from project files. |
| External root | A folder outside the project root from which files may be linked. Its machine-specific path is stored in local settings, not in the project. |
| Archive | A project marked as archived after integrity checks, manifest creation and export. Opens read-only. |

4\. Project model

4.1 Relationship to Obsidian vaults

| **Obsidian** | **Research Notebook** |
|----|----|
| Vault folder | Project folder |
| .obsidian/ configuration | \_notebook/project.yaml and \_notebook/styles/ |
| A note | \_notebook/experiments/EXP-042/experiment.md |
| Attachments folder | EXP-042/evidence/ and EXP-042/methods/ |
| Note properties (frontmatter) | Experiment ID, ref, question, title, status, dates |
| Bases table view over notes | The experiment table |
| Vault switcher | Recent projects list; one project per window |

Two differences are deliberate. The project folder also contains
analysis scripts, results and data, so the application reads only
\_notebook/ and the specific files artefacts point to; it never scans
the whole project. Experiment folders are flat under experiments/, so
moving an experiment to another question changes one frontmatter value
rather than moving a folder.

4.2 Entities and relationships

> Project ─1:n─ Question ─1:n─ Experiment
>
> │
>
> ├─1:n─ Artefact ─1:n─ Version (copy mode)
>
> │ └──── Link record (link mode)
>
> ├─1:1─ Group tree ─ Group ─n:m─ Artefact (result role)
>
> ├─ Methods, Results notes, Interpretation sections
>
> │ ├─ References → Artefact ID + version
>
> │ └─ Citations → citekeys → bibliography.json
>
> └─ Literature (generated)

4.3 Table columns and their sources

The table is not stored. It is built from the files each time the
project opens and updated as files change.

| **Column** | **Source** | **Editable in** |
|----|----|----|
| Motivation | Body of questions/\<ref\>.md; shown once per question header row. | Question panel |
| Methods | \## Methods section of experiment.md, plus method-role artefacts. | Expanded view |
| Results | Result-role artefacts and the group tree in artefacts.yaml, with thumbnails. | Expanded view, Results panel |
| Results Notes | \## Results notes section. | Expanded view |
| Interpretation | \## Interpretation section. | Expanded view |
| Literature | Generated from citations in Methods and Interpretation; written to the literature block. | Read-only |

Row order and question order come from project.yaml. Column widths,
hidden columns and collapsed questions are stored there too, so the
layout travels with the project.

5\. On-disk format (format version 1)

> *This chapter is normative. Any change to it requires a format version
> increment, a migration, new fixtures, an ADR and maintainer approval.
> The machine-readable form of this chapter is the Zod schema set in
> packages/format, exported as JSON Schema to docs/format/schemas/.*

5.1 Folder layout

> MyProject/ project root
>
> ├─ \_notebook/
>
> │ ├─ project.yaml project settings, ordering, table layout
>
> │ ├─ README.md generated guide to reading this folder
>
> │ ├─ bibliography.json CSL-JSON cache of every cited source
>
> │ ├─ styles/
>
> │ │ └─ nature.csl the active citation style
>
> │ ├─ questions/
>
> │ │ └─ Q-003.md
>
> │ ├─ experiments/
>
> │ │ └─ EXP-042/
>
> │ │ ├─ experiment.md narrative sections and literature
>
> │ │ ├─ artefacts.yaml artefacts, versions, checksums, groups
>
> │ │ ├─ evidence/ captured result files (immutable)
>
> │ │ └─ methods/ captured scripts and notebooks
>
> │ ├─ inbox/ capture requests from VS Code
>
> │ ├─ exports/ HTML, PDF/A, manifest, notebook.json
>
> │ ├─ backups/ version-change backups
>
> │ ├─ .history/ automatic text snapshots
>
> │ ├─ .trash/ deleted experiments and versions
>
> │ └─ .lock present while a writer has the project open
>
> ├─ scripts/ results/ data/ analysis files (never written by the app)

5.2 General encoding rules

| **Aspect** | **Rule** |
|----|----|
| Text encoding | UTF-8 without byte-order mark on write. A BOM is accepted and removed on read. |
| Line endings | LF on write. CRLF is accepted on read. |
| Final newline | Every text file ends with exactly one LF. |
| Paths in files | Relative, forward slashes, Unicode NFC. No absolute paths in project files. |
| Identifiers | ULID: 26 characters, Crockford Base32, uppercase. |
| Timestamps | RFC 3339 in UTC with Z, second precision, for example 2026-09-15T10:42:07Z. |
| Dates | ISO 8601 calendar dates, YYYY-MM-DD. |
| YAML | YAML 1.2 core schema. Strings are always double-quoted on write. Known keys are written in the documented order; unknown keys are preserved after known keys in their original order. Comments are not guaranteed to survive a write. |
| JSON | Two-space indentation, keys in documented order, trailing newline. |
| Application-created filenames | Follow the Windows-safe rules in section 9.2; at most 64 characters. |
| Canonical form | For any file the application writes, serialise(parse(file)) reproduces the file byte for byte. |

5.3 project.yaml

| **Key** | **Type** | **Req.** | **Description** |
|----|----|----|----|
| format_version | integer | Yes | Notebook format version. 1 for this specification. |
| id | ULID | Yes | Project identifier. |
| name | string | Yes | Display name. |
| created | timestamp | Yes | Creation time. |
| last_written_by | string | Yes | Application version that last wrote any project file, for example 0.4.2. |
| archived | timestamp or null | Yes | Time the project was archived; null when active. |
| locale | string | Yes | BCP 47 tag used for citation rendering, default en-GB. |
| citation_style | string | Yes | Filename of the active style in styles/. |
| capture.copy_threshold_mb | integer | Yes | Files at or below this size are copied; larger files are linked. Default 100. |
| capture.evidence_in_git | boolean | Yes | When false, .gitignore excludes evidence and methods folders. Default false. |
| numbering.next_question | integer | Yes | Next question ref number. |
| numbering.next_experiment | integer | Yes | Next experiment ref number. |
| order | list | Yes | Question display order; each entry is {question: ULID, experiments: \[ULID\]}. |
| table.columns | list | Yes | Each entry {key, width, hidden}; keys are motivation, methods, results, results_notes, interpretation, literature. |
| table.collapsed_questions | list of ULID | Yes | Question rows collapsed in the table. |
| external_roots | list | Yes | Each entry {id: ULID, label: string}. Paths are stored per machine in application settings. |

> format_version: 1
>
> id: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC"
>
> name: "Batch effects in treated organoids"
>
> created: "2026-09-01T09:12:44Z"
>
> last_written_by: "0.1.0"
>
> archived: null
>
> locale: "en-GB"
>
> citation_style: "nature.csl"
>
> capture:
>
> copy_threshold_mb: 100
>
> evidence_in_git: false
>
> numbering:
>
> next_question: 4
>
> next_experiment: 43
>
> order:
>
> \- question: "01JAXA1C5D8E2F4G6H7J9K0M1N"
>
> experiments: \["01JAXQ8M3K7T2V9R4W6Y5Z0B1C",
> "01JAXQ9P2L6S1U8X3Z5A7C9E0G"\]
>
> table:
>
> columns:
>
> \- {key: "motivation", width: 220, hidden: false}
>
> \- {key: "methods", width: 260, hidden: false}
>
> \- {key: "results", width: 280, hidden: false}
>
> \- {key: "results_notes", width: 300, hidden: false}
>
> \- {key: "interpretation", width: 320, hidden: false}
>
> \- {key: "literature", width: 240, hidden: false}
>
> collapsed_questions: \[\]
>
> external_roots: \[\]

5.4 Question files

Path: questions/\<ref\>.md. The frontmatter holds id (ULID), ref
(Q-###), title and created. The body is the Motivation in Markdown with
no required headings. Citations written in a Motivation by hand are
preserved but are not offered by the editor and do not appear in any
Literature section in this release.

5.5 Experiment files

Path: experiments/\<ref\>/experiment.md.

| **Key** | **Type** | **Req.** | **Description** |
|----|----|----|----|
| id | ULID | Yes | Experiment identifier; authoritative over the folder name. |
| ref | string | Yes | EXP-###; matches the folder name. |
| question | ULID | Yes | Owning question. |
| title | string | Yes | Short descriptive title. |
| status | enum | Yes | planned, running, complete or abandoned. |
| started | date | No | Date work began. |
| completed | date | No | Date work finished. |
| created | timestamp | Yes | Creation time. |
| updated | timestamp | Yes | Last application write. |

Body structure:

1.  Content before the first recognised heading is a **preamble**,
    preserved unchanged.

2.  Sections begin with level-2 headings \## Methods, \## Results notes
    and \## Interpretation. Headings are matched case-insensitively and
    trimmed on read and written in canonical form.

3.  Unknown level-2 sections are preserved in their original position.

4.  A missing recognised section is created, empty, the first time it is
    edited, in canonical order relative to existing recognised sections.

5.  A recognised heading that appears more than once makes the file open
    read-only with a parse error.

6.  The literature block is delimited by \<!-- literature:start --\> and
    \<!-- literature:end --\> at the end of the file. The application
    replaces the whole block on each regeneration. If the block's
    content differs from what the application last generated, the
    application warns before replacing it.

5.6 Artefact reference syntax

A reference is a standard Markdown inline link whose title identifies
the artefact and version.

> artefact-ref = "\[" label "\]" "(" target SP title ")"
>
> title = DQUOTE "art:" ulid \[ SP "v" version \] DQUOTE
>
> label = display name at the time of the last application write
>
> target = relative path from experiment.md to the version file (copy
> mode)
>
> or to the source file (link mode)
>
> version = 1\*DIGIT ; required for copy mode, absent for link mode
>
> Copy mode:
>
> \[PCA by treatment\](evidence/pca_by_treatment.v2.pdf
> "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2")
>
> Link mode:
>
> \[Raw counts\](../../../data/counts.h5
> "art:01JAXR9Q1W3E5R7T9Y1U3I5O7P")

- The application resolves a reference by ULID and version through
  artefacts.yaml. The target path exists for readers without the
  application.

- On every write the application rewrites the label and target of every
  reference to match current metadata.

- A link whose title does not begin with art: is an ordinary link.

- A reference to an ULID not present in artefacts.yaml is preserved and
  rendered as detached.

5.7 Citation syntax

Citations use Pandoc citation syntax so that pandoc --citeproc renders
them without the application.

> citekey = "z:" library ":" item-key
>
> library = "u" / ( "g" 1\*DIGIT ) ; u = user library, g\<id\> = group
> library
>
> item-key = 8( %x32-39 / %x41-5A ) ; Zotero item key, uppercase
>
> Examples:
>
> \[@z:u:7XK2PQ9M\]
>
> \[see @z:u:9HJ3LM2N, fig. 2; @z:g4521:ABCD2345, pp. 10-12\]
>
> \[-@z:u:7XK2PQ9M\] suppress-author form, preserved

- The editor inserts bracketed citations only. Author-in-text forms
  (@z:u:7XK2PQ9M \[p. 4\]) written by hand are preserved and rendered.

- Locators use Pandoc's recognised locator terms; the picker offers
  page, chapter, figure, section, table and supplement.

- The user library is always written as u, whether Zotero reports it as
  0 or as the numeric user ID.

5.8 artefacts.yaml

| **Key** | **Type** | **Req.** | **Description** |
|----|----|----|----|
| format_version | integer | Yes | 1\. |
| artefacts\[\] | list | Yes | All artefacts of the experiment, in capture order. |
| id | ULID | Yes | Artefact identifier; unique within the project. |
| name | string | Yes | Display name. |
| role | enum | Yes | result or method. |
| mode | enum | Yes | copy or link. |
| type | enum | Yes | image, pdf, svg, table, script, notebook, text, html or other; derived from the extension at capture. |
| source.root | string | Yes | project or the ULID of an external root. |
| source.path | string | Yes | Path of the original file relative to that root. |
| created | timestamp | Yes | First capture time. |
| versions\[\] | list | copy | Immutable versions, ascending. |
| v | integer | Yes | Version number from 1. |
| file | string | Yes | Path relative to the experiment folder. |
| sha256 | string | Yes | Lowercase hexadecimal SHA-256 of the file. |
| size | integer | Yes | Size in bytes. |
| captured | timestamp | Yes | Capture time. |
| provenance | object | No | repo (path of the repository root relative to the project root), commit (40 hexadecimal characters), path_in_repo, file_dirty and tree_dirty (booleans). |
| link | object | link | sha256, size, observed_mtime, checked (timestamp). |
| groups\[\] | list | Yes | Top-level group nodes. |
| id, name | ULID, string | Yes | Group identity and name. |
| items | list of ULID | Yes | Member artefact IDs in display order. |
| groups | list | Yes | Nested group nodes in display order. |

Constraints: every item refers to a result-role artefact in the same
file; an artefact appears at most once in any single group; method-role
artefacts never appear in groups. The tree structure makes cycles
impossible.

5.9 bibliography.json

A CSL-JSON array. Each item's id is its citekey. Each item carries
\_zotero: {server_id, library, key, fetched, status} where status is ok,
trashed or missing. The file contains every source cited anywhere in the
project. Uncited items are removed only by the archive step or an
explicit clean-up action, so that undoing a deletion never loses
metadata.

5.10 Inbox requests

Each request is a folder inbox/\<ULID\>/ containing request.json and,
for copy mode, the payload file. Writers create the folder under a
temporary name ending in .tmp and rename it when complete; readers
ignore .tmp folders.

| **Key** | **Type** | **Description** |
|----|----|----|
| format_version | integer | 1\. |
| request_id | ULID | Equals the folder name. |
| created | timestamp | Time of capture. |
| created_by | string | Writer identity, for example vscode-extension@0.1.0. |
| experiment_id | ULID | Target experiment. |
| role | enum | result or method. |
| mode | enum | copy or link. |
| source | object | {root, path} as in artefacts.yaml. |
| payload | string or null | Filename of the copied file in the request folder; null for link mode. |
| sha256, size | string, integer | Checksum and size of the payload or linked file. |
| provenance | object or null | As in artefacts.yaml. |
| group_path | list of string | Optional group names from the top level; created if absent. |

On import the application validates the request, matches the source to
an existing artefact (creating a new version if the checksum differs) or
creates a new artefact, moves the payload into place, and removes the
request folder. Invalid requests remain in the inbox and are listed with
the error.

5.11 Local state files

| **File** | **Contents and rules** |
|----|----|
| .lock | JSON {host, pid, app_version, opened, heartbeat}. Heartbeat updated every 60 seconds. A lock without a heartbeat for five minutes is stale and may be taken over after user confirmation. |
| .history/ | Snapshots at .history/\<path relative to \_notebook\>/\<timestamp\>.\<ext\>. Retention: every snapshot for 24 hours, one per hour for 7 days, one per day for 90 days, one per week thereafter. |
| backups/ | backups/\<timestamp\>-before-\<app version\>/ containing all \_notebook text files, created before the first write by a different application version. |
| .trash/ | .trash/\<timestamp\>/\<original relative path\>. Emptied only by an explicit user action. |

5.12 Repository hygiene files

On project creation the application appends these entries to the project
root .gitignore and .gitattributes, creating the files if absent and
never removing existing lines.

> \# .gitignore (added by Research Notebook)
>
> \_notebook/.lock
>
> \_notebook/.history/
>
> \_notebook/.trash/
>
> \_notebook/inbox/
>
> \_notebook/backups/
>
> \_notebook/experiments/\*/evidence/ \# omitted when
> capture.evidence_in_git is true
>
> \_notebook/experiments/\*/methods/ \# omitted when
> capture.evidence_in_git is true
>
> \# .gitattributes (added by Research Notebook)
>
> \_notebook/\*\*/\*.md text eol=lf
>
> \_notebook/\*\*/\*.yaml text eol=lf
>
> \_notebook/\*\*/\*.json text eol=lf
>
> \_notebook/\*\*/\*.csl text eol=lf

5.13 Format versioning and migration

1.  Every change to chapter 5 increments format_version.

2.  An application opening a project with a higher format_version than
    it supports opens it read-only.

3.  Migrations are pure functions in packages/format/migrations, one per
    version step, and are never deleted.

4.  Before migrating, the application creates a version-change backup
    and confirms with the user.

5.  Archived projects are never migrated in place; unarchiving performs
    the migration.

6.  Each released format version has fixture projects under
    fixtures/projects/format-v\<N\>/, and CI opens, edits, saves and
    re-reads every fixture with the current build.

6\. Architecture

6.1 Technology stack

Exact versions are pinned in lockfiles during Stage 0. Every dependency
must be compatible with AGPL-3.0-or-later, and CI enforces licence
allow-lists.

| **Concern** | **Choice** | **Licence** | **Notes** |
|----|----|----|----|
| Desktop shell | Tauri 2 | MIT / Apache-2.0 | WebView2 on Windows, WKWebView on macOS. |
| Interface | React, TypeScript (strict) | MIT | pnpm workspaces monorepo. |
| Experiment table | TanStack Table and TanStack Virtual | MIT | Headless; the application renders question header rows and read-only cells. |
| Rich-text editor | Tiptap core with @tiptap/markdown | MIT | Markdown extension uses MarkedJS; its MarkdownManager API is beta, so the version is pinned. No Tiptap Pro extensions. |
| Format library | packages/format using yaml and Zod | ISC / MIT | Single parser and serialiser for all notebook files. |
| Citation processing | citeproc-js in a Web Worker | CPAL-1.0 or AGPL-3.0+ | Used under AGPL-3.0-or-later. |
| Citation styles | CSL styles repository | CC BY-SA 3.0 | Attribution shown in About. |
| Index | SQLite with FTS5 via rusqlite | Public domain / MIT | Stored in the application cache directory. |
| Image thumbnails | Rust image crate | MIT / Apache-2.0 |  |
| PDF preview | pdf.js | Apache-2.0 | Runs in the webview. |
| Delimited tables | Rust csv and flate2 | MIT / Apache-2.0 | Bounded sampling including gzip. |
| Git provenance | gix, with git CLI fallback | MIT / Apache-2.0 | Stage 1 confirms status support. |
| PDF/A export | Typst embedded as a library | Apache-2.0 | Pinned; reads JSON data, never concatenated markup. |
| Archives | Rust zip crate with ZIP64 | MIT |  |
| VS Code extension | TypeScript, VS Code API, Git extension API | MIT (VS Code API) | Uses packages/format. |
| Typed IPC | tauri-specta | MIT | Generates TypeScript bindings for Rust commands. |

6.2 Repository layout

> research-notebook/
>
> ├─ AGENTS.md CLAUDE.md LICENSE README.md CONTRIBUTING.md
>
> ├─ docs/
>
> │ ├─ spec/ this specification (Markdown mirror)
>
> │ ├─ format/ format-v1.md and generated JSON Schemas
>
> │ ├─ adr/ architecture decision records
>
> │ └─ testing-guide.md
>
> ├─ apps/desktop/
>
> │ ├─ src/ React application
>
> │ │ ├─ features/ one folder per feature (table, results, editor,
> citations, archive...)
>
> │ │ ├─ ipc/ generated command bindings (do not edit)
>
> │ │ └─ shared/ UI primitives and hooks
>
> │ ├─ src-tauri/
>
> │ │ ├─ src/commands/ thin command layer
>
> │ │ └─ crates/ nb-fs, nb-index, nb-preview, nb-zotero, nb-git,
> nb-export, nb-archive
>
> │ └─ e2e/ WebdriverIO end-to-end tests
>
> ├─ packages/
>
> │ ├─ format/ parse, serialise, validate, migrate notebook files
>
> │ └─ citations/ citation contexts, citeproc worker, style handling
>
> ├─ extensions/vscode/ capture extension
>
> ├─ fixtures/projects/ format-v1 fixture projects
>
> └─ .github/workflows/ ci.yml, nightly.yml, release.yml

6.3 Component responsibilities

| **Component** | **Owns** | **Must not** |
|----|----|----|
| packages/format | Parsing, serialising, validating and migrating every notebook file; schemas; reference and citation syntax. | Perform file I/O, depend on React or Tauri, or contain UI logic. |
| packages/citations | Citation contexts, citeproc worker protocol, style validation, literature block rendering. | Perform file I/O or call Zotero. |
| apps/desktop/src | Views, editors, application state, user interaction. | Parse notebook text itself, access the filesystem directly, or call Zotero directly. |
| src-tauri commands | Validating inputs and delegating to crates. | Contain business logic. |
| nb-fs | Path validation, atomic writes, hashing, discovery, watching, history, trash, lock. | Write outside \_notebook/, or delete anything outside .history, .trash, inbox and the cache. |
| nb-index | Derived SQLite index and full-text search. | Store any data not reproducible from project files. |
| nb-preview | Thumbnails and bounded samples. | Read beyond configured bounds. |
| nb-zotero | HTTP calls to 127.0.0.1:23119, server ID handling. | Contact any other host. |
| nb-export, nb-archive | Manifest, verification, HTML, PDF/A, bundles, git bundle. | Modify project records except the archived flag. |
| extensions/vscode | Creating inbox requests. | Write any other notebook file. |

6.4 Opening a project

1.  Resolve the folder and read \_notebook/project.yaml through
    packages/format.

2.  Determine mode: read-only if the format is newer, the file fails to
    parse, the project is archived, the lock is live, the media is
    read-only, or the build is a development build and the project is
    not a test copy.

3.  Acquire the lock and start the heartbeat when writable.

4.  Load question, experiment and artefact files; build or incrementally
    update the index keyed by project ID, comparing file size,
    modification time and content hash.

5.  Start the watcher on \_notebook/.

6.  Import pending inbox requests.

7.  Check availability of linked artefacts in the background.

8.  Render the table.

6.5 Backend command rules

- Every command is typed through tauri-specta; the frontend never builds
  command names or paths from strings at runtime.

- Path parameters are project-relative. The backend normalises them,
  rejects .. traversal, resolves symlinks, and confirms the result lies
  inside the project root or a registered external root.

- Write commands accept only destinations inside \_notebook/.

- There is no generic read, write or delete command.

- Errors are typed enums serialised to the frontend with a user-facing
  message key.

6.6 Index schema

Tables: files (path, size, mtime, hash), questions, experiments,
artefacts, versions, groups, memberships, refs (experiment, section,
artefact, version, offset), citations (experiment, section, citekey,
cluster, position), sources, and fts (FTS5 over titles, sections,
display names, filenames and source titles). The index records its own
schema version; any mismatch triggers a full rebuild.

6.7 Security

- Tauri capabilities grant the webview no filesystem, shell or HTTP
  plugin permissions.

- Content Security Policy forbids remote scripts, styles, images and
  connections.

- SVG files are displayed only through \<img\> elements, which do not
  execute scripts.

- HTML artefacts are never rendered in the application; they open in the
  system browser.

- Markdown rendering never executes embedded HTML; raw HTML is shown as
  text or passthrough.

- The asset protocol scope is limited to the thumbnail cache and
  \_notebook/experiments/\*/evidence and methods.

- Typst templates receive user text only as data values.

7\. Functional requirements

7.1 Projects

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-PRJ-01 | Create a project in a new or existing folder: create the \_notebook/ layout, project.yaml, README.md, and append .gitignore and .gitattributes entries without removing existing lines. | Must |
| FR-PRJ-02 | Open a project by selecting a folder containing \_notebook/project.yaml, or by opening a bundle file. | Must |
| FR-PRJ-03 | Keep a recent-projects list with last known paths in application settings; a missing path offers Locate project. | Must |
| FR-PRJ-04 | Allow several windows, each with a different project. | Should |
| FR-PRJ-05 | Acquire .lock on writable open; open read-only with a banner if a live lock exists; offer takeover of stale locks after confirmation. | Must |
| FR-PRJ-06 | Show a banner in every read-only mode stating the reason and the available action. | Must |
| FR-PRJ-07 | Manage external roots: labels in the project, paths per machine; unresolved roots mark their linked artefacts unavailable. | Should |
| FR-PRJ-08 | Project settings: name, citation style, locale, copy threshold, evidence in git. | Must |

7.2 Questions and experiments

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-EXP-01 | Create a question with a new ULID and the next Q-### ref. | Must |
| FR-EXP-02 | Create an experiment in a question with a new ULID, the next EXP-### ref, its folder, an experiment.md with empty sections and an empty artefacts.yaml; append it to the question's order. | Must |
| FR-EXP-03 | Never reuse refs, including after deletion. | Must |
| FR-EXP-04 | Move an experiment to another question by updating its question value and the order lists; the folder is unchanged. | Must |
| FR-EXP-05 | Edit title, status and dates. | Must |
| FR-EXP-06 | Delete an experiment or question by moving its files to .trash/; Empty trash is a separate confirmed action. | Must |
| FR-EXP-07 | Detect duplicate refs and offer renumbering; IDs remain authoritative. | Should |
| FR-EXP-08 | Show experiments absent from order at the end of their question, and experiments whose question is missing under an Unassigned header. | Must |

7.3 Workspace table and expanded view

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-TBL-01 | Show one row per experiment with the columns in section 4.3. | Must |
| FR-TBL-02 | Show a full-width header row per question with title, Motivation summary, experiment count and a collapse control. | Must |
| FR-TBL-03 | Apply sorting and filtering within each question; headers remain visible and show "n of m" when filtered. | Must |
| FR-TBL-04 | Resize and hide columns; persist settings in project.yaml. | Must |
| FR-TBL-05 | Render cells as read-only, line-clamped summaries from Markdown; the table contains no live editor instances. | Must |
| FR-TBL-06 | Results cells show group counts, up to four thumbnails and Browse all. | Must |
| FR-TBL-07 | The expanded experiment view edits all sections, with Results Notes and Interpretation side by side at widths of 1280 px or more. | Must |
| FR-TBL-08 | Reorder experiments and questions by drag, keyboard or menu. | Should |
| FR-TBL-09 | Filter by status, text, missing evidence and references with newer versions. | Should |
| FR-TBL-10 | Virtualise rows so projects with hundreds of experiments scroll smoothly. | Must |

7.4 Evidence capture and linking

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-EVD-01 | Capture by drag and drop, file picker, discovery proposal or inbox import. | Must |
| FR-EVD-02 | Choose copy mode at or below the threshold and link mode above it, with a per-capture override. | Must |
| FR-EVD-03 | Copy to a temporary file inside \_notebook/, hashing while copying; verify size and hash; move atomically into evidence/ or methods/. | Must |
| FR-EVD-04 | Name captured files from the sanitised original name; resolve collisions with -2, -3; name later versions \<stem\>.v\<N\>\<ext\>. | Must |
| FR-EVD-05 | Create no new version when content matches an existing version of the same artefact; warn when content matches a different artefact. | Must |
| FR-EVD-06 | Offer a new version when a source's hash differs from its latest version; never create versions automatically. | Must |
| FR-EVD-07 | For linked files record hash, size and observed modification time; check availability on open by size and time, and by hash on demand. | Must |
| FR-EVD-08 | Mark missing linked files unavailable without altering notes; offer Relink with candidates ranked by name, size and hash; never apply a candidate without confirmation. | Must |
| FR-EVD-09 | Discovery scans a chosen folder with include and exclude globs (defaults exclude .git, .snakemake, .nextflow, work, node_modules, \_\_pycache\_\_, .\_\*, .DS_Store, Thumbs.db), is cancellable, shows progress, and marks sources already captured. | Must |
| FR-EVD-10 | Treat versions as immutable; Delete version shows reference counts and moves the file to .trash/. | Must |
| FR-EVD-11 | Edit display names; default to the filename without extension. | Must |
| FR-EVD-12 | Record git provenance when the source lies in a repository: repository path, HEAD commit, file and tree dirty flags. | Must |
| FR-EVD-13 | Show total evidence size and warn above a configurable limit, default 5 GB. | Should |

7.5 Virtual groups

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-GRP-01 | Create, rename, nest and delete groups; deleting a group removes memberships only, never artefacts or files. | Must |
| FR-GRP-02 | Provide Move to group and Add to group as separate actions, available by drag, keyboard and menu. | Must |
| FR-GRP-03 | Prevent an artefact appearing twice in one group. | Must |
| FR-GRP-04 | Preserve manual ordering of groups and items. | Must |
| FR-GRP-05 | Show an Ungrouped area for result artefacts without memberships. | Must |
| FR-GRP-06 | Collapse groups with more than 50 items by default and show counts. | Must |

7.6 Preview panel

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-PRV-01 | Show display name, original filename, type, role, mode, versions with capture times, group locations, availability and provenance. | Must |
| FR-PRV-02 | Offer Open file, Reveal in Finder or Explorer, Open in VS Code, Copy path, and Open project folder as a distinct action. | Must |
| FR-PRV-03 | Preview according to section 8 with the stated bounds; never load whole large files. | Must |
| FR-PRV-04 | Cache thumbnails in the application cache directory keyed by content hash and thumbnail size. | Must |
| FR-PRV-05 | Show a readable inline state and recovery action when a preview fails. | Must |

7.7 Editors and artefact references

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-EDT-01 | Support paragraphs, bold, italic, inline code, bulleted and numbered lists, links, headings of levels 3 and 4, block quotes and code blocks. | Must |
| FR-EDT-02 | Preserve unsupported Markdown, including tables and raw HTML, as read-only passthrough blocks. | Must |
| FR-EDT-03 | Allow one live editor at a time; autosave one second after the last change and on blur; show Saved, Saving, Unsaved or Error. | Must |
| FR-EDT-04 | Typing @ at the start of a line, after whitespace or after an opening bracket opens autocomplete over the experiment's artefacts, searching display name and filename, showing type icon, group path and version, with keyboard navigation and Escape to dismiss. | Must |
| FR-EDT-05 | Pin inserted references to the artefact's latest version. | Must |
| FR-EDT-06 | Render references as chips with the current display name; hover or focus shows filename and version; activation opens the pinned version's preview. | Must |
| FR-EDT-07 | Mark references whose artefact has a newer version and offer Update reference and Update all in section. | Must |
| FR-EDT-08 | Render references to removed artefacts as detached with the last known label. | Must |
| FR-EDT-09 | Rewrite reference labels and targets to current metadata on every save. | Must |

7.8 Citations and Literature

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-CIT-01 | Report Zotero status as connected, disabled (HTTP 403 with instructions to enable the local API) or not running. | Must |
| FR-CIT-02 | Send every Zotero request from the Rust backend to 127.0.0.1:23119 with API version 3, and record the Zotero-Server-ID when present. | Must |
| FR-CIT-03 | Offer Cite from the slash menu in Methods and Interpretation, opening a picker with debounced search, multi-select, per-item locator, prefix and suffix. | Must |
| FR-CIT-04 | Render citation chips through CSL; activation opens source details with Open in Zotero, DOI link and Open PDF when available. | Must |
| FR-CIT-05 | Add or update the CSL-JSON of each inserted source in bibliography.json. | Must |
| FR-CIT-06 | Render citations and Literature only from bibliography.json. | Must |
| FR-CIT-07 | Refresh sources on request; set status to ok, trashed or missing; ask before overwriting data from a different server ID. | Must |
| FR-CIT-08 | Keep missing and trashed sources visible; offer replacement with another item, which updates citekeys in the text. | Must |
| FR-CIT-09 | Process one citation context per experiment containing Methods then Interpretation in document order. | Must |
| FR-CIT-10 | Generate Literature with one entry per distinct source; numbered styles number by first appearance; regenerate on every citation or style change. | Must |
| FR-CIT-11 | Bundle a set of in-text styles and allow importing .csl files; reject note styles with an explanation; copy the active style into styles/. | Must |
| FR-CIT-12 | List the experiments that cite a source. | Must |

7.9 Search and reverse lookups

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-SRC-01 | Search titles, sections, display names, filenames, and source titles and authors. | Must |
| FR-SRC-02 | Group results by experiment with section and snippet; open at the matching location. | Must |
| FR-SRC-03 | Show where each artefact is referenced. | Must |

7.10 VS Code extension

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-VSC-01 | Provide Research Notebook: Add file to experiment in the Explorer and editor title context menus. | Must |
| FR-VSC-02 | Find the project by searching upwards from the file for \_notebook/project.yaml. | Must |
| FR-VSC-03 | Offer a quick pick of experiments showing ref, title and question, read through packages/format. | Must |
| FR-VSC-04 | Offer role and mode options, defaulting to result and automatic mode. | Must |
| FR-VSC-05 | Copy the payload at click time, hash it, record git provenance through the VS Code Git API, and write the request atomically. | Must |
| FR-VSC-06 | Write nothing except inbox requests. | Must |
| FR-VSC-07 | Confirm the capture and state whether it will import now or when the project is next opened. | Should |

7.11 History, backups and conflicts

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-HIS-01 | Snapshot the previous content of any notebook text file before overwriting it. | Must |
| FR-HIS-02 | Apply the retention policy in section 5.11. | Must |
| FR-HIS-03 | Browse, compare and restore snapshots per experiment; restoring snapshots the current content first. | Should |
| FR-HIS-04 | Create a version-change backup before the first write by an application version different from last_written_by. | Must |
| FR-HIS-05 | Reload files changed on disk; if unsaved edits exist for that file, keep both versions and show a conflict resolution view. | Must |
| FR-HIS-06 | Detect conflict copies created by Dropbox, OneDrive and iCloud and report them. | Should |

7.12 Archive and export

| **ID** | **Requirement** | **Priority** |
|----|----|----|
| FR-ARC-01 | Run an integrity check listing missing files, unresolved references, external files, and missing or trashed sources, each to be resolved or acknowledged. | Must |
| FR-ARC-02 | Write exports/manifest.csv with relative path, size, modification time, SHA-256, experiments and groups for every artefact file. | Must |
| FR-ARC-03 | Verify files against the manifest and report differences. | Must |
| FR-ARC-04 | Optionally write a git bundle of each repository referenced by provenance. | Should |
| FR-ARC-05 | Export static HTML with downscaled figures, sampled tables and relative links to originals. | Must |
| FR-ARC-06 | Export PDF/A-3b through Typst with notebook.json and bibliography.json embedded, including a combined project bibliography processed as a fresh citation context. | Must |
| FR-ARC-07 | Export notebook.json with JSON Schemas and Markdown renderings of every section. | Must |
| FR-ARC-08 | Create a notebook bundle (\_notebook/ only) and a full archive (whole project) as ZIP64 files with a registered extension; store already-compressed formats without recompression; warn when the destination is FAT32. | Must |
| FR-ARC-09 | Mark the project archived and open archived projects read-only. | Must |
| FR-ARC-10 | Unarchive after confirmation, performing any migration with a backup first. | Must |
| FR-ARC-11 | Optionally include Zotero PDFs of cited sources, off by default, with a warning about sharing publishers' files. | Could |

8\. Preview behaviour

| **Type** | **Extensions** | **Thumbnail** | **Preview** | **Bounds** |
|----|----|----|----|----|
| Raster image | png, jpg, jpeg, gif, webp, tif, tiff, bmp | 256 px PNG generated in Rust; first page of multi-page TIFF | Fit to panel with zoom | No thumbnail above 200 MB or 100 megapixels; fallback icon |
| PDF | pdf | First page at 256 px via pdf.js | Page viewer | Pages rendered on demand |
| SVG | svg | \<img\> element | \<img\> element | 20 MB; scripts never execute |
| Delimited table | csv, tsv, csv.gz, tsv.gz | Table icon | Header and 200 rows, 50 columns; expand to 2,000 rows | 256 KiB read initially, 8 MiB expanded; UTF-8, BOM and Windows-1252 detection; dimensions shown only when fully counted |
| Script and text | R, py, sh, smk, nf, wdl, md, txt, yaml, json, toml, log | Type icon | First 500 lines, monospaced | 1 MiB |
| Notebook | ipynb, Rmd, qmd | Type icon | File details, language and kernel from metadata, Open in VS Code | 1 MiB metadata read |
| HTML report | html, htm | Type icon | Details only; Open in browser | Never rendered |
| Other | any | Type icon | Type, size, location, Open with system application | No content read |

9\. Cross-platform requirements

9.1 Supported platforms

| **Platform** | **Support** |
|----|----|
| Windows 11, x64 | Must |
| Windows 11, Arm64 | Should |
| Windows 10 22H2, x64 | Should (best effort) |
| macOS 13 or later, Apple silicon and Intel (universal build) | Must |
| Linux | Not a release target; code must not prevent it |

9.2 Filenames created by the application

| **Rule** | **Detail** |
|----|----|
| Forbidden characters | \< \> : " / \\ \| ? \* and control characters are replaced with \_. |
| Reserved names | CON, PRN, AUX, NUL, COM1 to COM9, LPT1 to LPT9, with or without extensions, receive a \_ suffix. |
| Trailing characters | Trailing dots and spaces are removed. |
| Length | At most 64 characters including extension; longer names are shortened with a 6-character hash suffix. |
| Normalisation | Unicode NFC. |
| Case collisions | Names differing only by case are treated as collisions. |

9.3 Path handling

- Paths are stored with forward slashes and converted only at the
  operating-system boundary.

- Comparisons normalise to NFC; a case-insensitive match is offered for
  confirmation, never applied silently.

- Relative paths in project files are resolved from the project root or
  the experiment folder as documented for each field.

- Generated paths under \_notebook/ stay short enough that the full path
  of an evidence file is below 200 characters for a project root of 60
  characters.

- Symlinks and hard links are never created.

- File operations that fail because another process holds the file retry
  with backoff for up to five seconds, then report the locked file by
  name.

- Modification time is a hint only; identity is decided by SHA-256.

9.4 Platform behaviour

| **Behaviour** | **Windows** | **macOS** |
|----|----|----|
| Webview engine | WebView2 (Evergreen) | WKWebView |
| Reveal file | Explorer with the file selected | Finder with the file selected |
| Shortcut modifier | Ctrl (Tiptap Mod) | Cmd (Tiptap Mod) |
| File locking | Mandatory locks; retry | Advisory locks |
| Default filename case | Insensitive, preserving | Insensitive, preserving |
| Files ignored by discovery | Thumbs.db, desktop.ini | .\_\*, .DS_Store |
| Settings directory | %APPDATA%\\app id\> | ~/Library/Application Support/\<app id\> |
| Cache directory (index, thumbnails) | %LOCALAPPDATA%\\app id\>\cache | ~/Library/Caches/\<app id\> |
| Installer | Signed installer | Signed and notarised universal disk image |
| Open in VS Code | vscode://file/C:/path/to/file | vscode://file/path/to/file |
| Fonts | Bundled interface and export fonts | Bundled interface and export fonts |

10\. Non-functional requirements

10.1 Performance

Thresholds are measured on a reference machine defined in Stage 1
(suggested: four-core laptop, 16 GB memory, SSD) using the fixture
projects. Stage 1 may recalibrate them through an ADR.

| **ID** | **Scenario** | **Threshold** | **Measured by** |
|----|----|----|----|
| NFR-PERF-01 | Open a project with 500 experiments and 5,000 artefacts with a warm index | Table interactive in under 2 s | Benchmark suite, nightly |
| NFR-PERF-02 | Full index rebuild of the same project | Under 20 s; UI remains responsive | Benchmark suite, nightly |
| NFR-PERF-03 | Scroll the 500-experiment table | No frame longer than 50 ms | E2E performance trace |
| NFR-PERF-04 | Render the collapsed Results tree of an experiment with 2,000 artefacts | Under 200 ms | Component benchmark |
| NFR-PERF-05 | Discovery over 50,000 files | Progress within 500 ms; cancellation within 1 s; UI responsive | Integration test |
| NFR-PERF-06 | Full-text search on the 500-experiment project | Results in under 200 ms | Benchmark suite |
| NFR-PERF-07 | Autosave after typing | Written within 1.5 s of the last keystroke | Integration test |
| NFR-PERF-08 | Delimited table preview of a 2 GB file | Memory increase under 50 MB | Integration test |
| NFR-PERF-09 | Citation context update after inserting a citation in an experiment with 200 citations | Literature updated in under 300 ms | Component benchmark |

10.2 Accessibility

- Target WCAG 2.2 level AA.

- Every action is available by keyboard, including group operations,
  reordering and reference insertion.

- Visible focus indicators on all interactive elements.

- Autocomplete and pickers follow the ARIA combobox pattern and are
  announced by NVDA and VoiceOver.

- Status is never conveyed by colour alone; icons are paired with text
  labels.

- Automated axe-core checks report no serious or critical violations.

10.3 Reliability

- A crash or power loss leaves every notebook file either in its
  previous or its new complete state.

- At most 1.5 seconds of typing may be lost in a crash.

- The application never writes a file it failed to parse.

- Every overwrite of a notebook text file is preceded by a history
  snapshot.

10.4 Privacy

- No telemetry, analytics or crash reporting leaves the machine.

- Network access is limited to 127.0.0.1:23119 for Zotero and, when
  enabled by the user, the update endpoint.

10.5 Language

Interface text is written in British English and stored in message files
so translation can follow. Code identifiers use the domain term artefact
consistently.

11\. Data safety safeguards

| **Risk** | **Safeguard** | **Verified by** |
|----|----|----|
| Application bug deletes or alters analysis files | No backend command can write outside \_notebook/; no generic file commands | Filesystem snapshot test over the full integration suite |
| Crash during save corrupts notes | Atomic write: temporary file, flush, rename with retry | Fault-injection test |
| Parser bug rewrites notes incorrectly | Canonical round-trip tests; passthrough of unknown content; no writes after parse errors | Property, golden and malformed-input tests |
| New release breaks projects | Version-change backup; read-only for newer formats; fixtures from every format version | Fixture compatibility suite |
| Developer breaks the build used for research | Separate stable and development builds; development build read-only on non-test projects | Release checklist test |
| Application becomes unusable | Plain Markdown, YAML and CSL-JSON; README with Pandoc recovery command | Recovery test with the application uninstalled |
| Accidental deletion | Trash for experiments and versions; history snapshots | Integration tests |
| Overwritten pipeline outputs change evidence | Immutable captured versions; references pinned to versions | Capture property tests |
| Two writers at once | Lock file with heartbeat; conflict view for external edits | Lock and conflict tests |
| Index corruption | Index is disposable and rebuilt from files | Delete-and-rebuild equality test |
| Archive bit rot or incomplete copy | SHA-256 manifest and Verify | Byte-flip detection test |

12\. Testing strategy

12.1 Test layers

| **Layer** | **Purpose** | **Tools** | **Runs** |
|----|----|----|----|
| Static checks | Formatting, linting, types, architecture boundaries | Prettier, ESLint, tsc, dependency-cruiser, rustfmt, clippy | Pre-commit and every pull request |
| Licence and advisory checks | AGPL compatibility and known vulnerabilities | cargo-deny, npm licence checker, pnpm audit | Every pull request and weekly |
| Unit tests | Individual functions and components | Vitest, Testing Library, cargo test | Every pull request |
| Property tests | Invariants over generated inputs: round-trip, groups, citations, filenames, paths | fast-check, proptest | 1,000 cases per pull request; 100,000 nightly |
| Golden tests | Exact expected outputs for serialisation and export | Vitest snapshot files, veraPDF | Every pull request |
| Fixture compatibility | Every fixture project from every format version opens, edits, saves and re-reads | Vitest and Rust integration tests | Every pull request |
| Filesystem safety | Nothing outside \_notebook/ changes during the integration suite | Rust integration test with directory snapshots | Every pull request |
| Integration | Backend commands with real temporary projects; Zotero mock server; VS Code extension host | cargo test, Vitest, @vscode/test-electron | Every pull request |
| End-to-end | Core user workflow through the real application | WebdriverIO with the Tauri service and embedded WebDriver plugin | Nightly and before release, Windows and macOS |
| Cross-OS handoff | Project created on one OS verifies and edits on the other | GitHub Actions artefacts between jobs | Nightly and before release |
| Accessibility | Automated rule checks | axe-core | Every pull request touching UI |
| Performance | Section 10.1 thresholds | Vitest bench, criterion | Nightly with trend report |
| Mutation testing | Confirms tests detect injected faults in critical modules | StrykerJS, cargo-mutants | Weekly on packages/format, packages/citations, nb-fs |

12.2 Continuous integration

- **Pull request pipeline (required to merge):** static checks, licence
  checks, unit, property (short), golden, fixture, filesystem safety and
  integration tests on windows-latest and macos-latest.

- **Nightly pipeline:** long property runs, end-to-end tests, cross-OS
  handoff, PDF/A validation, performance benchmarks.

- **Weekly pipeline:** mutation testing and dependency advisory scan.

- **Release pipeline:** full nightly suite, signed builds, installer
  smoke tests, manual checklist.

- The main branch is protected; required checks cannot be bypassed, and
  tests cannot be skipped without a linked issue and maintainer
  approval.

12.3 Fixtures and golden files

- Fixture projects live in fixtures/projects/format-v\<N\>/\<name\>/ and
  are never edited after their format version is released; new cases are
  added as new fixtures.

- Required fixtures: minimal, typical (3 questions, 12 experiments),
  large (500 experiments, 5,000 artefacts, generated by a committed
  script), edge-cases (Unicode names, CRLF files, BOM, unknown keys,
  passthrough Markdown, detached references, trashed sources), malformed
  (files expected to open read-only).

- Golden files change only through pnpm golden:update, and the diff must
  be reviewed by the maintainer.

- Property tests log their seed on failure; every failing seed becomes a
  permanent regression case.

12.4 Stage gates

Implementation follows the stages in the development workbook. A stage
closes only when every task is done and every gate test passes on both
Windows and macOS where marked. The workbook records results, dates and
evidence links.

13\. Acceptance criteria for the first release

| **ID** | **Criterion** |
|----|----|
| AC-01 | A researcher can create a project, add a question and experiment, capture evidence, organise it into groups and write linked observations and interpretation without leaving the application. |
| AC-02 | Reorganising groups or adding memberships changes no file outside artefacts.yaml and preserves all references. |
| AC-03 | Capturing changed content creates a new version; earlier versions and the references pinned to them are unchanged. |
| AC-04 | Moving a project folder to another drive, or between Windows and macOS, requires no repair; every reference and copied artefact resolves. |
| AC-05 | A missing linked file is identifiable, keeps its notes and references, and can be relinked. |
| AC-06 | Inserting, repeating, deleting and reordering citations and changing styles keep Interpretation, Methods and Literature consistent, including numbered styles. |
| AC-07 | Existing citations render with Zotero closed, and missing or trashed sources are visible and repairable. |
| AC-08 | Deleting the index and reopening the project restores identical content, groups, references and search results. |
| AC-09 | With the application uninstalled, every note and bibliography is readable in a text editor, and the README's Pandoc command renders an experiment with citations. |
| AC-10 | A malformed hand-edited file opens read-only and is not modified. |
| AC-11 | An external edit while the application is open reloads, and a concurrent unsaved edit produces a conflict with both versions kept. |
| AC-12 | A second instance, or the development build on a non-test project, opens read-only. |
| AC-13 | A capture from VS Code with the application closed is imported when the project next opens, with provenance. |
| AC-14 | An archive created on one operating system verifies and opens read-only on the other; a single changed byte in any file is reported. |
| AC-15 | The PDF/A export passes veraPDF validation and contains notebook.json and bibliography.json. |
| AC-16 | Large result collections remain compact, and previews read bounded content as in section 8. |
| AC-17 | All performance thresholds in section 10.1 are met on the reference machine. |
| AC-18 | Automated accessibility checks pass and the core workflow is completed with keyboard only and with a screen reader on each platform. |
| AC-19 | No test in the release suite changes any file outside a project's \_notebook/ folder. |
| AC-20 | Signed installers run on clean Windows 11 and macOS machines without security overrides. |

14\. Deferred features

| **Feature** | **Reason for deferral** | **Format impact** |
|----|----|----|
| Citations in Motivation with a question-level context | Author-date disambiguation differs across experiments sharing a Motivation | None; syntax already preserved |
| User-defined property columns from frontmatter | Requires filtering and column UI beyond first release | None; unknown frontmatter keys already preserved |
| References across experiments | Requires cross-experiment autocomplete and resolution rules | Additive reference form |
| Rendering notebook contents | Complexity and security of executing or displaying outputs | None |
| Specialist previews (h5ad, loom, BAM) | Format-specific libraries | None |
| Remote roots over SSH | All files currently local | External root type extension |
| Zotero write-back | Local API writes require authorisation prompts and are not needed | None |
| Word export | PDF/A and HTML cover archiving; Pandoc can convert | None |
| Collaboration and synchronisation | Out of scope for a local tool | Would require merge rules |
| Linux release | Testing burden | None |

15\. Decisions and open questions

15.1 Initial architecture decision records

| **ADR** | **Decision** |
|----|----|
| ADR-0001 | Plain files in \_notebook/ are the source of truth; SQLite is a disposable index. |
| ADR-0002 | packages/format is the only parser and serialiser of notebook files. |
| ADR-0003 | Evidence is captured as immutable versions by default, with linking above a size threshold. |
| ADR-0004 | Pandoc citation syntax and Markdown links with art: titles are the inline reference formats. |
| ADR-0005 | TanStack Table replaces AG Grid; cells are read-only and one live editor exists at a time. |
| ADR-0006 | The project is licensed AGPL-3.0-or-later. |
| ADR-0007 | Typst generates PDF/A exports from JSON data. |
| ADR-0008 | Stable and development builds use different application identifiers. |

15.2 Open questions

| **Question** | **Resolve by** |
|----|----|
| Final application name, application identifier and bundle file extension | Stage 0 |
| Bundled citation style list | Stage 5 |
| Whether gix status support is sufficient or the git CLI is required | Stage 1 |
| Reference machine specification for performance thresholds | Stage 1 |
| Default thumbnail sizes and cache size limit | Stage 3 |
| Code-signing route for Windows open-source releases | Stage 7 |

Appendix A. Example files

A.1 experiments/EXP-042/experiment.md

> ---
>
> id: "01JAXQ8M3K7T2V9R4W6Y5Z0B1C"
>
> ref: "EXP-042"
>
> question: "01JAXA1C5D8E2F4G6H7J9K0M1N"
>
> title: "PCA of treatment and batch"
>
> status: "complete"
>
> started: "2026-09-02"
>
> completed: "2026-09-05"
>
> created: "2026-09-02T08:30:00Z"
>
> updated: "2026-09-05T16:11:42Z"
>
> ---
>
> \## Methods
>
> PCA on variance-stabilised counts using DESeq2 \[@z:u:7XK2PQ9M\].
>
> Script: \[02_pca.R\](methods/02_pca.R "art:01JAXR2B4C6D8E0F2G4H6J8K0M
> v1")
>
> \## Results notes
>
> Treatment groups separate along PC1 \[PCA by
> treatment\](evidence/pca_by_treatment.v2.pdf
> "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2").
>
> Batch remains associated with part of the variation \[PCA by
> batch\](evidence/pca_by_batch.pdf "art:01JAXR6E1F3G5H7J9K1M3N5P7Q
> v1").
>
> \## Interpretation
>
> The PC1 separation is consistent with the treatment response reported
> previously \[see @z:u:9HJ3LM2N, fig. 2; @z:g4521:ABCD2345\].
>
> \<!-- literature:start --\>
>
> \## Literature
>
> 1\. Love, M. I., Huber, W. & Anders, S. Moderated estimation of fold
> change and dispersion for RNA-seq data with DESeq2. Genome Biol. 15,
> 550 (2014).
>
> 2\. …
>
> \<!-- literature:end --\>

A.2 experiments/EXP-042/artefacts.yaml

> format_version: 1
>
> artefacts:
>
> \- id: "01JAXR2B4C6D8E0F2G4H6J8K0M"
>
> name: "PCA script"
>
> role: "method"
>
> mode: "copy"
>
> type: "script"
>
> source: {root: "project", path: "scripts/02_pca.R"}
>
> created: "2026-09-03T13:58:02Z"
>
> versions:
>
> \- v: 1
>
> file: "methods/02_pca.R"
>
> sha256: "5c0e…"
>
> size: 4121
>
> captured: "2026-09-03T13:58:02Z"
>
> provenance:
>
> repo: "."
>
> commit: "3f9c1e2d…"
>
> path_in_repo: "scripts/02_pca.R"
>
> file_dirty: false
>
> tree_dirty: true
>
> \- id: "01JAXR5D8K2M4N6P8Q0R2S4T6V"
>
> name: "PCA by treatment"
>
> role: "result"
>
> mode: "copy"
>
> type: "pdf"
>
> source: {root: "project", path: "results/pca/pca_by_treatment.pdf"}
>
> created: "2026-09-03T14:02:11Z"
>
> versions:
>
> \- v: 1
>
> file: "evidence/pca_by_treatment.pdf"
>
> sha256: "9b1c…"
>
> size: 88213
>
> captured: "2026-09-03T14:02:11Z"
>
> \- v: 2
>
> file: "evidence/pca_by_treatment.v2.pdf"
>
> sha256: "4e7a…"
>
> size: 90411
>
> captured: "2026-09-05T09:40:52Z"
>
> \- id: "01JAXR9Q1W3E5R7T9Y1U3I5O7P"
>
> name: "Raw counts"
>
> role: "result"
>
> mode: "link"
>
> type: "other"
>
> source: {root: "project", path: "data/counts.h5"}
>
> created: "2026-09-02T10:00:00Z"
>
> link:
>
> sha256: "c21f…"
>
> size: 18400000000
>
> observed_mtime: "2026-08-30T22:14:09Z"
>
> checked: "2026-09-05T16:00:00Z"
>
> groups:
>
> \- id: "01JAXS0A2B4C6D8E0F2G4H6J8K"
>
> name: "Figures"
>
> items:
>
> \- "01JAXR5D8K2M4N6P8Q0R2S4T6V"
>
> \- "01JAXR6E1F3G5H7J9K1M3N5P7Q"
>
> groups:
>
> \- id: "01JAXS1B3C5D7E9F1G3H5J7K9M"
>
> name: "QC"
>
> items: \["01JAXR6E1F3G5H7J9K1M3N5P7Q"\]
>
> groups: \[\]

A.3 Recovery command in the generated README

> cd \_notebook/experiments/EXP-042
>
> pandoc experiment.md --citeproc \\
>
> --bibliography ../../bibliography.json \\
>
> --csl ../../styles/nature.csl \\
>
> -o EXP-042.docx

Appendix B. Development stages

Full task lists and gate tests are in
Development_Stages_and_Test_Gates.xlsx.

| **Stage** | **Name** | **Weeks** | **Outcome** |
|----|----|----|----|
| 0 | Repository foundation | 1 | Monorepo, agent rules, CI on both platforms, licence and boundary checks, fixture harness |
| 1 | Technical spikes | 2 | Markdown round-trip, citeproc worker, Zotero client, previews, Typst PDF/A, table prototype proven |
| 2 | File format and index | 5 | Format library, safe writes, lock, history, index, questions, experiments, table, expanded view |
| 3 | Evidence, groups and previews | 4 | Capture, versions, linking, inbox, VS Code extension, groups, previews |
| 4 | Writing and references | 3 | Editors, references, version updates, search; internal alpha |
| 5 | Citations and Literature | 3 | Zotero picker, bibliography cache, contexts, styles, repair |
| 6 | Archive and export | 2 | Integrity, manifest, verify, HTML, PDF/A, bundles, archived mode |
| 7 | Cross-platform release | 3 | Handoff and end-to-end suites, build channels, signing, accessibility, performance |
