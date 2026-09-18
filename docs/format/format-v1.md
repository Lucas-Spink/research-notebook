# Notebook format, version 1

Status: **draft for maintainer approval** (S2-T01). No parser or serialiser exists yet; S2-T02 starts only after this document is approved.

This document is the normative definition of every file the application reads and writes inside `_notebook/`. It refines chapter 5 of the technical specification (`docs/spec/specification.md`) and follows the same normative language: **must**, **should** and **may** as in spec 1.6. Once approved and released, any change to it needs a format version increment, a migration, new fixtures, an ADR and maintainer approval (AGENTS.md section 2, rule 3).

The machine-readable form is the Zod schema set in `packages/format/src/schema/`, exported as JSON Schema to `docs/format/schemas/` by `pnpm schemas:export`. Where this document, the Zod schemas and the JSON Schemas could disagree, the Zod schemas are executable and a test fails on drift between them and the JSON Schemas; section 8 lists every place this document goes beyond the specification so the maintainer can approve each one.

## 1. Files covered

| File                                      | Path (relative to `_notebook/`)         | Schema file                  | Section |
| ----------------------------------------- | --------------------------------------- | ---------------------------- | ------- |
| Project settings                          | `project.yaml`                          | `project.schema.json`        | 4.1     |
| Question                                  | `questions/<ref>.md`                    | `question.schema.json`       | 4.2     |
| Experiment                                | `experiments/<ref>/experiment.md`       | `experiment.schema.json`     | 4.3     |
| Artefact record                           | `experiments/<ref>/artefacts.yaml`      | `artefacts.schema.json`      | 4.4     |
| Bibliography cache                        | `bibliography.json`                     | `bibliography.schema.json`   | 4.5     |
| Inbox request                             | `inbox/<ULID>/request.json`             | `request.schema.json`        | 4.6     |
| Lock                                      | `.lock`                                 | `lock.schema.json`           | 4.7     |
| Everything else (README, styles, history) | see 4.8                                 | none                         | 4.8     |

The `experiment.schema.json` file describes the frontmatter only. The body of an experiment file is Markdown and is specified by the grammar in section 4.3, not by JSON Schema.

## 2. Value types

Every value type below is defined once and used by name in the file sections. JSON Schema can express only the patterns; the remaining rules are enforced by the Zod schemas (marked **Zod only**).

| Type          | Rule                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ulid`        | 26 characters matching `^[0-7][0-9A-HJKMNP-TV-Z]{25}$`: uppercase Crockford Base32 (no I, L, O or U) with a first character of at most 7 so the value fits 128 bits.                                                                                                                   |
| `timestamp`   | `YYYY-MM-DDTHH:MM:SSZ`: UTC, literal `Z`, second precision, no fraction, no offset, no leap second. Must be a real calendar date and time (**Zod only**).                                                                                                                            |
| `date`        | `YYYY-MM-DD`, a real calendar date (**Zod only** for the calendar check).                                                                                                                                                                                                            |
| `sha256`      | 64 lowercase hexadecimal characters.                                                                                                                                                                                                                                                  |
| `commit`      | 40 lowercase hexadecimal characters (the full object name, never abbreviated).                                                                                                                                                                                                        |
| `path`        | A relative path (**Zod only**): forward slashes only; Unicode NFC; not empty; no empty segments (so no leading, trailing or doubled `/`); no `.` or `..` segment; no leading `/`; no drive letter prefix such as `C:`; no control characters. Containment is checked by `nb-fs`.       |
| `repo-path`   | `.` (the project root itself) or a `path`.                                                                                                                                                                                                                                            |
| `filename`    | A single path component (**Zod only**): a `path` that contains no `/` or `\` and is not `.` or `..`. The Windows-safe naming rules of spec 9.2 apply to names the application creates and are enforced when writing, not when reading.                                                  |
| `text`        | Single-line display text: at least one character; no control characters (U+0000 to U+001F, U+007F) and no U+2028 or U+2029 (**Zod only**).                                                                                                                                          |
| `question-ref`| `Q-` followed by at least three digits, not `000`, and no leading zeros beyond the first three: `Q-003` and `Q-1000` are valid, `Q-0003` and `Q-3` are not.                                                                                                                          |
| `exp-ref`     | `EXP-` with the same digit rule: `EXP-042` and `EXP-1000` are valid, `EXP-0042` is not.                                                                                                                                                                                              |
| `citekey`     | `z:<library>:<item-key>` (spec 5.7): library `u` or `g<digits>`; item key 8 characters from `2-9` and `A-Z`.                                                                                                                                                                         |
| `semver`      | `MAJOR.MINOR.PATCH` with an optional `-pre` or `+build` suffix, for example `0.4.2`.                                                                                                                                                                                                  |
| `locale`      | A BCP 47 shape: a 2 or 3 letter language followed by hyphen-separated subtags of 2 to 8 letters or digits, for example `en-GB`. Checked by pattern, not by `Intl`, so behaviour is identical on every platform.                                                                        |
| `count`       | A non-negative integer.                                                                                                                                                                                                                                                                |

## 3. Encoding and canonical form

### 3.1 Encoding

- UTF-8 without a byte-order mark on write. A BOM is accepted on read and dropped.
- LF line endings on write. CRLF is accepted on read and becomes LF on the next write.
- Every text file ends with exactly one LF. A file that ends with none, or with more than one, is accepted on read.
- No tab characters in anything the application writes as structure. YAML is indented with spaces.

### 3.2 What canonical means

**Canonical form** is the single byte sequence the application writes for a given parsed model. For any file the application wrote, `serialise(parse(file))` **must** equal the file byte for byte (spec 5.2). Files written by other tools, or edited by hand, need not be canonical; they are accepted if they validate, and become canonical when the application next writes them.

The consequence for gate S2-G01 is that "every file in every fixture" can only mean every fixture file that is already canonical. Fixtures that deliberately contain CRLF, a BOM or hand-written variants (the `edge-cases` fixture, spec 12.3) cannot round-trip byte for byte and need a marker saying so. That is a S2-T13 concern and is recorded in section 8.

### 3.3 Key order and unknown keys

- Known keys are written in the order given in the key tables of section 4.
- Unknown keys are preserved, written after all known keys of the same object, in their original relative order. This applies at every nesting level (spec 5.2).
- YAML comments are not preserved.
- A key that is optional is **omitted** when absent. An explicit `null` is accepted only where a table says so.

### 3.4 YAML layout (`project.yaml`, `artefacts.yaml`, frontmatter)

| Aspect                | Rule                                                                                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dialect               | YAML 1.2 core schema.                                                                                                                                                                                                                                                      |
| Indentation           | Two spaces per level. Block sequence entries are indented two spaces under their key: `order:` then `  - question: "..."`.                                                                                                                                                 |
| Keys                  | Plain (unquoted).                                                                                                                                                                                                                                                          |
| Strings               | Always double-quoted, including ULIDs, timestamps, dates, enum values and refs. Non-ASCII characters are written as UTF-8, not escaped. `"` and `\` are escaped with a backslash.                                                                                          |
| Other scalars         | Integers as plain decimal, booleans as `true` or `false`, null as `null`.                                                                                                                                                                                                  |
| Line width            | No folding or wrapping: a scalar is always written on one line, however long.                                                                                                                                                                                              |
| Lists of scalars      | Block style, one entry per line (`- "01JAX..."`). An empty list is `[]`.                                                                                                                                                                                                   |
| Lists of objects      | Block style, one object per entry, its keys on following lines. Exception: `table.columns` entries use flow style (below).                                                                                                                                                 |
| Flow objects          | Written on one line as `{key: value, key: value}`: no space inside the braces, one space after each comma. Used for exactly two things: `source` (in `artefacts.yaml`) and each entry of `table.columns`. Every other object is block style. An empty object is `{}`.       |
| Document markers      | None in `.yaml` files. Frontmatter is fenced by lines containing exactly `---` (section 4.3).                                                                                                                                                                              |
| Anchors, aliases, tags| Rejected on read. Nothing the application writes uses them, and they make round-tripping ambiguous.                                                                                                                                                                        |
| Duplicate keys        | Rejected on read.                                                                                                                                                                                                                                                          |

### 3.5 JSON layout (`bibliography.json`, `request.json`, `.lock`)

Two-space indentation, one array element or object member per line, keys in the documented order (unknown keys after known keys), a final LF. Empty arrays are `[]` and empty objects `{}`. Strings use the escapes `JSON.stringify` produces and are otherwise UTF-8.

`bibliography.json` items have one exception to the general key order: `id` is written first, all other CSL-JSON fields follow in their original order, and `_zotero` is written **last**. This keeps the bibliographic data readable ahead of the bulky cache metadata.

## 4. Files

Each table lists keys in canonical order. **Req.** is *Yes* when the key must be present.

### 4.1 `project.yaml`

Schema: `project.schema.json`. Spec 5.3.

| Key                         | Type                             | Req. | Notes                                                                                                                                      |
| --------------------------- | -------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `format_version`            | integer, exactly `1`             | Yes  | A larger value makes the project read-only (section 6).                                                                                    |
| `id`                        | `ulid`                           | Yes  | Project identity.                                                                                                                          |
| `name`                      | `text`                           | Yes  | Display name.                                                                                                                              |
| `created`                   | `timestamp`                      | Yes  |                                                                                                                                            |
| `last_written_by`           | `semver`                         | Yes  | Application version that last wrote any project file.                                                                                      |
| `archived`                  | `timestamp` or `null`            | Yes  | `null` when active. This key is the one place `null` is written.                                                                          |
| `locale`                    | `locale`                         | Yes  | Default `en-GB`.                                                                                                                           |
| `citation_style`            | `filename` ending in `.csl`      | Yes  | A file in `styles/`.                                                                                                                       |
| `capture`                   | object                           | Yes  |                                                                                                                                            |
| `capture.copy_threshold_mb` | `count`                          | Yes  | Default 100. `0` links every file.                                                                                                         |
| `capture.evidence_in_git`   | boolean                          | Yes  | Default `false`.                                                                                                                           |
| `numbering`                 | object                           | Yes  |                                                                                                                                            |
| `numbering.next_question`   | integer of at least 1            | Yes  | The application takes the larger of this and one more than the highest existing question number, so refs are never reused (FR-EXP-03).     |
| `numbering.next_experiment` | integer of at least 1            | Yes  | Same rule for experiments.                                                                                                                 |
| `order`                     | list of objects                  | Yes  | Question display order.                                                                                                                    |
| `order[].question`          | `ulid`                           | Yes  | No question appears twice.                                                                                                                 |
| `order[].experiments`       | list of `ulid`                   | Yes  | Display order. No experiment appears twice anywhere in `order`.                                                                            |
| `table`                     | object                           | Yes  |                                                                                                                                            |
| `table.columns`             | list of objects                  | Yes  | Array order is display order.                                                                                                              |
| `table.columns[].key`       | enum                             | Yes  | `motivation`, `methods`, `results`, `results_notes`, `interpretation`, `literature`. Each appears exactly once.                           |
| `table.columns[].width`     | integer of at least 1            | Yes  | CSS pixels. No upper bound.                                                                                                                |
| `table.columns[].hidden`    | boolean                          | Yes  |                                                                                                                                            |
| `table.collapsed_questions` | list of `ulid`                   | Yes  |                                                                                                                                            |
| `external_roots`            | list of objects                  | Yes  | Paths are stored per machine in application settings, never here.                                                                          |
| `external_roots[].id`       | `ulid`                           | Yes  | Unique within the list.                                                                                                                    |
| `external_roots[].label`    | `text`                           | Yes  |                                                                                                                                            |

Canonical example:

```yaml
format_version: 1
id: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC"
name: "Batch effects in treated organoids"
created: "2026-09-01T09:12:44Z"
last_written_by: "0.1.0"
archived: null
locale: "en-GB"
citation_style: "nature.csl"
capture:
  copy_threshold_mb: 100
  evidence_in_git: false
numbering:
  next_question: 4
  next_experiment: 43
order:
  - question: "01JAXA1C5D8E2F4G6H7J9K0M1N"
    experiments:
      - "01JAXQ8M3K7T2V9R4W6Y5Z0B1C"
      - "01JAXQ9P2M6S1T8X3Z5A7C9E0G"
table:
  columns:
    - {key: "motivation", width: 220, hidden: false}
    - {key: "methods", width: 260, hidden: false}
    - {key: "results", width: 280, hidden: false}
    - {key: "results_notes", width: 300, hidden: false}
    - {key: "interpretation", width: 320, hidden: false}
    - {key: "literature", width: 240, hidden: false}
  collapsed_questions: []
external_roots: []
```

### 4.2 Question files

Schema: `question.schema.json`. Spec 5.4. Path `questions/<ref>.md`: YAML frontmatter, then the Motivation as Markdown.

| Key       | Type          | Req. | Notes                                                              |
| --------- | ------------- | ---- | ------------------------------------------------------------------ |
| `id`      | `ulid`        | Yes  | Authoritative over the filename.                                   |
| `ref`     | `question-ref`| Yes  |                                                                    |
| `title`   | `text`        | Yes  |                                                                    |
| `created` | `timestamp`   | Yes  |                                                                    |

The body has no required headings and is preserved verbatim apart from line-ending normalisation and trimming of leading and trailing blank lines. Citations typed into a Motivation are preserved but are not offered by the editor and do not appear in any Literature section in this release.

Canonical layout: `---` line, the frontmatter, `---` line, one blank line, the body, one final LF. An empty body is written as the closing fence followed by one LF and nothing else.

### 4.3 Experiment files

Schema: `experiment.schema.json` (frontmatter only). Spec 5.5. Path `experiments/<ref>/experiment.md`.

**Frontmatter**

| Key         | Type                                              | Req. | Notes                                                                                     |
| ----------- | ------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------- |
| `id`        | `ulid`                                            | Yes  | Authoritative over the folder name.                                                       |
| `ref`       | `exp-ref`                                         | Yes  | Normally equals the folder name; a mismatch is reported, not fatal (section 5).           |
| `question`  | `ulid`                                            | Yes  | Owning question.                                                                          |
| `title`     | `text`                                            | Yes  |                                                                                           |
| `status`    | enum                                              | Yes  | `planned`, `running`, `complete` or `abandoned`.                                          |
| `started`   | `date`                                            | No   | Omitted when absent; an explicit `null` is rejected.                                      |
| `completed` | `date`                                            | No   | Same.                                                                                     |
| `created`   | `timestamp`                                       | Yes  |                                                                                           |
| `updated`   | `timestamp`                                       | Yes  | Last application write.                                                                   |

**File structure.** Line 1 is exactly `---`. The frontmatter ends at the next line that is exactly `---`. Everything after is the body. A file without this fence is a parse error, because `id` is required.

**Body grammar.** The format layer looks at the body only for the constructs below; everything else is opaque Markdown preserved as written.

1. Fenced code blocks (opened by a line of at least three backticks or tildes, closed by a line of the same character and at least the same length) are tracked so that nothing inside them is treated as a heading or marker.
2. A **heading line** is a line outside a fenced code block that begins at column 0 with `## ` (two hashes and a space). The heading text is the rest of the line with surrounding whitespace trimmed. Setext headings, headings indented by one or more spaces, and headings inside block quotes or lists are not headings for this purpose. Trailing closing hashes are not stripped.
3. A heading is **recognised** when its text, compared case-insensitively, is `methods`, `results notes` or `interpretation`. Any other level-2 heading starts an **unknown section**. Level 1 and levels 3 to 6 are ordinary body text.
4. The **preamble** is everything between the frontmatter and the first level-2 heading of any kind. It is preserved unchanged.
5. A **section** runs from its heading line to the line before the next level-2 heading, or before the literature block, or to the end of the file. Its **text** is the content after the heading line with leading and trailing blank lines removed; blank lines inside are preserved. Trailing spaces on a line are preserved (they are hard breaks in Markdown).
6. A recognised heading appearing more than once is a parse error and the file opens read-only (spec 5.5 rule 5). The same unknown heading may appear more than once.
7. The **literature block** starts at a line that is exactly `<!-- literature:start -->` and ends at the next line that is exactly `<!-- literature:end -->`, outside any fenced code block. Its content is the text between those lines with leading and trailing blank lines removed. It must be the last non-blank content in the file; text after `<!-- literature:end -->` other than blank lines, a second start marker, or a start without an end is a parse error. There is at most one block.
8. `## Literature` inside the block is part of the block, not a section. A `## Literature` heading outside the block is an unknown section.

The parsed body model is `{preamble, sections, literature}`: `sections` is an ordered list of `{key, body}` for recognised sections (`methods`, `results_notes`, `interpretation`) and `{key: "unknown", heading, body}` for unknown ones; `literature` is a string or `null`. See `ExperimentBody` in `packages/format/src/schema/experiment.ts`.

**Canonical layout.** The file is the frontmatter block followed by body blocks. Consecutive blocks are separated by exactly one blank line and the file ends with one LF.

- Blocks, in order: the preamble (only if non-empty), each section in its stored order, then the literature block (only if present).
- A section block is its heading line, and, if its text is non-empty, one blank line and the text. An empty section is only its heading line.
- A recognised heading is written in canonical form `## Methods`, `## Results notes` or `## Interpretation`. An unknown heading is written exactly as read, with its original text.
- The literature block is `<!-- literature:start -->`, its content, `<!-- literature:end -->`, on consecutive lines.

**Creating a missing section.** The first time a missing recognised section is edited it is inserted in canonical order (Methods, Results notes, Interpretation) relative to the recognised sections that exist: immediately after the nearest preceding recognised section; if none precedes it, immediately before the nearest following one; if the file has no recognised sections, after every other section and before the literature block.

Canonical example (spec Appendix A.1):

```markdown
---
id: "01JAXQ8M3K7T2V9R4W6Y5Z0B1C"
ref: "EXP-042"
question: "01JAXA1C5D8E2F4G6H7J9K0M1N"
title: "PCA of treatment and batch"
status: "complete"
started: "2026-09-02"
completed: "2026-09-05"
created: "2026-09-02T08:30:00Z"
updated: "2026-09-05T16:11:42Z"
---

## Methods

PCA on variance-stabilised counts using DESeq2 [@z:u:7XK2PQ9M].

## Results notes

Treatment groups separate along PC1.

## Interpretation

The PC1 separation is consistent with the treatment response reported previously [see @z:u:9HJ3LM2N, fig. 2].

<!-- literature:start -->
## Literature

1. Love, M. I., Huber, W. & Anders, S. Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2. Genome Biol. 15, 550 (2014).
<!-- literature:end -->
```

**Inline syntax inside sections.** Artefact references and citations are recognised inside section text and are specified in section 7.

### 4.4 `artefacts.yaml`

Schema: `artefacts.schema.json`. Spec 5.8. Path `experiments/<ref>/artefacts.yaml`.

| Key                                                          | Type                              | Req.       | Notes                                                                                                            |
| ------------------------------------------------------------ | --------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `format_version`                                             | integer, exactly `1`              | Yes        |                                                                                                                  |
| `artefacts`                                                  | list of objects                   | Yes        | Capture order. May be empty.                                                                                     |
| `artefacts[].id`                                             | `ulid`                            | Yes        | Unique in this file; must also be unique in the project (section 5).                                             |
| `artefacts[].name`                                           | `text`                            | Yes        | Display name.                                                                                                    |
| `artefacts[].role`                                           | enum                              | Yes        | `result` or `method`.                                                                                            |
| `artefacts[].mode`                                           | enum                              | Yes        | `copy` or `link`. Decides which of `versions` and `link` is present.                                            |
| `artefacts[].type`                                           | enum                              | Yes        | `image`, `pdf`, `svg`, `table`, `script`, `notebook`, `text`, `html` or `other`.                                 |
| `artefacts[].source`                                         | flow object                       | Yes        | `{root, path}`.                                                                                                  |
| `artefacts[].source.root`                                    | `"project"` or `ulid`             | Yes        | A `ulid` names an entry of `external_roots` in `project.yaml`.                                                   |
| `artefacts[].source.path`                                    | `path`                            | Yes        | Relative to that root.                                                                                           |
| `artefacts[].created`                                        | `timestamp`                       | Yes        | First capture time.                                                                                              |
| `artefacts[].versions`                                       | list of objects                   | copy only  | At least one. Forbidden when `mode` is `link`.                                                                   |
| `artefacts[].versions[].v`                                   | integer of at least 1             | Yes        | Strictly ascending. Gaps are allowed: a deleted version's number is not reused (FR-EVD-10).                      |
| `artefacts[].versions[].file`                                | `path`                            | Yes        | Relative to the experiment folder and beginning `evidence/` or `methods/`.                                       |
| `artefacts[].versions[].sha256`                              | `sha256`                          | Yes        |                                                                                                                  |
| `artefacts[].versions[].size`                                | `count`                           | Yes        | Bytes.                                                                                                           |
| `artefacts[].versions[].captured`                            | `timestamp`                       | Yes        |                                                                                                                  |
| `artefacts[].versions[].provenance`                          | object                            | No         | See below.                                                                                                       |
| `artefacts[].link`                                           | object                            | link only  | Forbidden when `mode` is `copy`.                                                                                 |
| `artefacts[].link.sha256`                                    | `sha256`                          | Yes        | Hash of the linked file when last observed.                                                                      |
| `artefacts[].link.size`                                      | `count`                           | Yes        | Bytes when last observed.                                                                                        |
| `artefacts[].link.observed_mtime`                            | `timestamp`                       | Yes        | Modification time when last observed. A hint only; identity is decided by hash (spec 9.3).                       |
| `artefacts[].link.checked`                                   | `timestamp`                       | Yes        | When availability was last checked.                                                                              |
| `groups`                                                     | list of objects                   | Yes        | Top-level group nodes in display order. May be empty.                                                            |
| `groups[].id`                                                | `ulid`                            | Yes        | Unique across the whole tree.                                                                                    |
| `groups[].name`                                              | `text`                            | Yes        |                                                                                                                  |
| `groups[].items`                                             | list of `ulid`                    | Yes        | Member artefact IDs in display order.                                                                            |
| `groups[].groups`                                            | list of objects                   | Yes        | Nested group nodes, same shape, in display order.                                                                |

**Provenance** is the object at `artefacts[].versions[].provenance` (optional) and at `provenance` in an inbox request (section 4.6). Its keys are written under whichever parent holds it:

| Key                     | Type        | Notes                                                                   |
| ----------------------- | ----------- | ----------------------------------------------------------------------- |
| `provenance.repo`         | `repo-path` | Repository root relative to the project root; `.` for the project root. |
| `provenance.commit`       | `commit`    | HEAD at capture.                                                        |
| `provenance.path_in_repo` | `path`      | The source file's path within the repository.                           |
| `provenance.file_dirty`   | boolean     | The file differed from HEAD.                                            |
| `provenance.tree_dirty`   | boolean     | The working tree differed from HEAD.                                    |

**Constraints** (enforced by the Zod schema; not expressible in JSON Schema): artefact ids unique in the file; group ids unique across the tree; every item is the id of a `result` artefact in this file; a `method` artefact is never an item; an artefact is listed at most once in any single group (it may be a member of several groups, including a group and its child); versions strictly ascending.

Canonical example (spec Appendix A.2, checksums shortened here for space; real values are 64 hexadecimal characters):

```yaml
format_version: 1
artefacts:
  - id: "01JAXR5D8K2M4N6P8Q0R2S4T6V"
    name: "PCA by treatment"
    role: "result"
    mode: "copy"
    type: "pdf"
    source: {root: "project", path: "results/pca/pca_by_treatment.pdf"}
    created: "2026-09-03T14:02:11Z"
    versions:
      - v: 1
        file: "evidence/pca_by_treatment.pdf"
        sha256: "9b1c..."
        size: 88213
        captured: "2026-09-03T14:02:11Z"
      - v: 2
        file: "evidence/pca_by_treatment.v2.pdf"
        sha256: "4e7a..."
        size: 90411
        captured: "2026-09-05T09:40:52Z"
  - id: "01JAXR9Q1W3E5R7T9Y1V3J5N7P"
    name: "Raw counts"
    role: "result"
    mode: "link"
    type: "other"
    source: {root: "project", path: "data/counts.h5"}
    created: "2026-09-02T10:00:00Z"
    link:
      sha256: "c21f..."
      size: 18400000000
      observed_mtime: "2026-08-30T22:14:09Z"
      checked: "2026-09-05T16:00:00Z"
groups:
  - id: "01JAXS0A2B4C6D8E0F2G4H6J8K"
    name: "Figures"
    items:
      - "01JAXR5D8K2M4N6P8Q0R2S4T6V"
    groups: []
```

### 4.5 `bibliography.json`

Schema: `bibliography.schema.json`. Spec 5.9. A CSL-JSON array; each item is a CSL-JSON object.

| Key                  | Type              | Req. | Notes                                                                                                        |
| -------------------- | ----------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| `id`                 | `citekey`         | Yes  | Unique in the file. Must equal `z:<library>:<key>` built from `_zotero`.                                     |
| _CSL-JSON fields_    | any                | No   | `type`, `title`, `author`, ... Not validated and preserved unchanged.                                        |
| `_zotero`            | object            | Yes  | Written last.                                                                                                |
| `_zotero.server_id`  | `text` or `null`  | Yes  | `null` when Zotero sent no `Zotero-Server-ID` (FR-CIT-02).                                                   |
| `_zotero.library`    | string            | Yes  | `u`, or `g` followed by digits.                                                                              |
| `_zotero.key`        | string            | Yes  | Zotero item key: 8 characters from `2-9` and `A-Z`.                                                          |
| `_zotero.fetched`    | `timestamp`       | Yes  |                                                                                                              |
| `_zotero.status`     | enum              | Yes  | `ok`, `trashed` or `missing`.                                                                                |

Array order is preserved as written; the application appends new sources at the end.

### 4.6 `request.json`

Schema: `request.schema.json`. Spec 5.10. Path `inbox/<ULID>/request.json`.

| Key             | Type                     | Req.     | Notes                                                                                                   |
| --------------- | ------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `format_version`| integer, exactly `1`     | Yes      |                                                                                                         |
| `request_id`    | `ulid`                   | Yes      | Equals the folder name; checked at import.                                                              |
| `created`       | `timestamp`              | Yes      |                                                                                                         |
| `created_by`    | `text`                   | Yes      | For example `vscode-extension@0.1.0`.                                                                   |
| `experiment_id` | `ulid`                   | Yes      | Target experiment.                                                                                      |
| `role`          | enum                     | Yes      | `result` or `method`.                                                                                   |
| `mode`          | enum                     | Yes      | `copy` or `link`.                                                                                       |
| `source`        | object                   | Yes      | `{root, path}` as in `artefacts.yaml`.                                                                  |
| `source.root`   | `"project"` or `ulid`    | Yes      | As in `artefacts.yaml`.                                                                                 |
| `source.path`   | `path`                   | Yes      | As in `artefacts.yaml`.                                                                                 |
| `payload`       | `filename` or `null`     | Yes      | Non-null exactly when `mode` is `copy`. A file name in the request folder, never a path.                |
| `sha256`        | `sha256`                 | Yes      | Of the payload or the linked file.                                                                      |
| `size`          | `count`                  | Yes      | Bytes.                                                                                                  |
| `provenance`    | provenance or `null`     | Yes      | `null` when the source is not in a repository. (In `artefacts.yaml` the key is omitted instead.)        |
| `group_path`    | list of `text`           | No       | Group names from the top level; created on import if absent.                                            |

Writers create the request folder under a temporary name ending in `.tmp` and rename it when complete; readers ignore `.tmp` folders (spec 5.10). Invalid requests are left in place and listed with the error, so unknown keys are accepted here for forward compatibility but a request that fails validation is never modified.

### 4.7 `.lock`

Schema: `lock.schema.json`. Spec 5.11. JSON, present while a writer has the project open.

| Key           | Type        | Req. | Notes                                                                                   |
| ------------- | ----------- | ---- | --------------------------------------------------------------------------------------- |
| `host`        | `text`      | Yes  | Machine name.                                                                           |
| `pid`         | integer, at least 1 | Yes |                                                                                  |
| `app_version` | `semver`    | Yes  |                                                                                         |
| `opened`      | `timestamp` | Yes  |                                                                                         |
| `heartbeat`   | `timestamp` | Yes  | Refreshed every 60 seconds. No heartbeat for five minutes makes the lock stale.         |

### 4.8 Files without a schema

- `README.md` (generated guide, spec A.3), `styles/*.csl` (CSL XML), `.history/`, `backups/`, `.trash/`, `exports/` and captured files under `evidence/` and `methods/` are not notebook data files. They are written by `nb-fs` and the export code and are never parsed by `packages/format`, except `styles/*.csl` for validation in `packages/citations`.
- `.gitignore` and `.gitattributes` entries follow spec 5.12.

## 5. Constraints that a schema cannot check

The Zod schemas check everything inside one file. The rules below span files or the filesystem; they belong to the project loader (S2-T05, S2-T10) and `nb-fs`. None is a schema error; each has a defined outcome so that behaviour is decided now.

| Rule                                                                                               | Outcome                                                                                              |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Experiment `ref` differs from its folder name                                                      | Reported. The `id` is authoritative (spec 5.5).                                                      |
| Duplicate `ref` across questions or experiments                                                    | Reported with an offer to renumber (FR-EXP-07). IDs remain authoritative.                            |
| Two files share an `id`, or artefact ids repeat across experiments                                | The later-loaded file opens read-only (spec P6).                                                     |
| Experiment absent from `order`                                                                     | Shown at the end of its question (FR-EXP-08).                                                        |
| Experiment whose `question` matches no question file                                              | Shown under Unassigned (FR-EXP-08).                                                                  |
| `order` names a question or experiment with no file                                                | Ignored and reported; the entry is dropped on the next write of `project.yaml`.                      |
| `source.root` is a `ulid` not present in `external_roots`                                          | The artefact is marked unavailable; nothing is rewritten (FR-PRJ-07).                                |
| A version's `file` is missing or its hash differs                                                  | Reported by verification; the record is never altered automatically (P4).                            |
| `numbering.next_*` is not above every existing and trashed ref number                              | The application uses the larger value on allocation (FR-EXP-03).                                     |
| A path resolves outside the project root or a registered external root, including by symlink       | Rejected by `nb-fs` (spec 6.5).                                                                      |

## 6. Versioning and read-only behaviour

- `packages/format` exports `FormatVersionProbe`, which reads only `format_version`. The project opener applies it to `project.yaml` first. A value above 1 opens the whole project read-only with the reason "newer format" and no further validation; the file is not touched (spec 5.13 rule 2, gate S2-G10).
- Any file that fails its schema, or breaks a rule in section 4, opens read-only for that file and is never rewritten (AGENTS.md section 2, rule 5).
- Migrations are pure functions in `packages/format/migrations`, one per version step, never deleted (spec 5.13). Version 1 has none.

## 7. Inline syntax in Markdown sections

### 7.1 Artefact references (spec 5.6)

```text
[label](target "art:<ulid>")            link mode
[label](target "art:<ulid> v<N>")       copy mode; N is a version number of at least 1
```

- A link whose title does not begin with `art:` is an ordinary link and is preserved untouched.
- The `<ulid>` follows the `ulid` type above, so an identifier containing I, L, O or U is not a reference and is treated as an ordinary link.
- The reference is resolved by ULID and version through `artefacts.yaml`. A reference to an id not in `artefacts.yaml` is preserved and shown as detached.
- **Label and target are derived.** On every write the application rewrites them to current metadata (FR-EDT-09): the label is the artefact's display name with `\`, `[` and `]` backslash-escaped; the target is the path from the experiment folder to the version file (copy mode) or to the source file (link mode).
- **Target quoting.** The target is written bare unless it contains a space, `(` or `)`, in which case it is wrapped in angle brackets: `[Raw](<../../../data/my counts.h5> "art:...")`. Percent-encoding is never used, because a percent-encoded path would not match the file on disk for a reader without the application.

### 7.2 Citations (spec 5.7)

Pandoc citation syntax with the `citekey` type: `[@z:u:7XK2PQ9M]`, `[see @z:u:9HJ3LM2N, fig. 2; @z:g4521:ABCD2345]`, `[-@z:u:7XK2PQ9M]`. Author-in-text forms written by hand are preserved. The user library is always written as `u`, whether Zotero reports it as `0` or as a numeric user id. The editor inserts bracketed forms only.

## 8. Decisions for the maintainer

The specification is silent, ambiguous or self-contradictory on the points below. Each is decided as shown so that the schemas and the canonical form are fully defined. **Approving this document approves every row.** Rows marked "Asked" were put to the maintainer before drafting.

| #  | Point                                       | Decision in this document                                                                                                                                                       | Origin        |
| -- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1  | ULID alphabet                               | Strict Crockford: no I, L, O or U, first character at most 7. Spec Appendix A examples that broke this are corrected.                                                            | Asked         |
| 2  | YAML list layout                            | Block, one entry per line, for lists of scalars; flow only for `source` and `table.columns` entries.                                                                            | Asked         |
| 3  | Timestamp strictness                        | Exactly `YYYY-MM-DDTHH:MM:SSZ`; fractions and offsets make the file read-only.                                                                                                  | Asked         |
| 4  | Spec Appendix A.2 contradicted itself       | A group listed an artefact that A.2 never defined, against the rule that items must exist in the same file. "PCA by batch" is added to A.2.                                      | Found         |
| 5  | Ref digits                                  | At least three digits, never `000`, no leading zeros beyond three (`EXP-1000` valid, `EXP-0042` not).                                                                            | Proposed      |
| 6  | Version numbers                             | Strictly ascending, gaps allowed (a deleted version's number is never reused).                                                                                                  | Proposed      |
| 7  | Version file location                       | Must begin `evidence/` or `methods/`; not tied to `role`.                                                                                                                       | Proposed      |
| 8  | Optional dates                              | Omitted when absent; `null` rejected.                                                                                                                                           | Proposed      |
| 9  | `_zotero.server_id`                         | `text` or `null`, key always present.                                                                                                                                           | Proposed      |
| 10 | `bibliography.json` `id`                    | Must equal `z:<library>:<key>` from `_zotero`; `_zotero` written last.                                                                                                          | Proposed      |
| 11 | `table.columns`                             | All six keys exactly once; array order is display order; `width` is a positive integer in CSS pixels with no upper bound.                                                       | Proposed      |
| 12 | Duplicate entries in `order`                | A repeated question, or an experiment listed twice, is a schema error (read-only).                                                                                              | Proposed      |
| 13 | Request `payload`                           | A `filename` (never a path); the Windows-safe rules of spec 9.2 are applied by the importer, not the schema.                                                                     | Proposed      |
| 14 | Unknown keys in `request.json`              | Accepted (forward compatibility); a request failing validation stays untouched in the inbox.                                                                                    | Proposed      |
| 15 | Preamble boundary                           | Content before the first level-2 heading of any kind, not only the first recognised one. The spec's literal wording ("first recognised heading") would fold an early unknown section into the preamble; the bytes preserved are the same either way. | Proposed      |
| 16 | Heading recognition                         | Level-2 ATX headings at column 0 outside fenced code; trailing closing hashes not stripped.                                                                                     | Proposed      |
| 17 | Section canonical layout                    | Blocks separated by exactly one blank line; empty section is its heading alone; recognised headings rewritten to canonical case; unknown headings verbatim.                     | Proposed      |
| 18 | Where a missing section is inserted         | After the nearest preceding recognised section, else before the nearest following, else after all sections and before the literature block.                                     | Proposed      |
| 19 | Content after `literature:end`              | A parse error (read-only), as are a second block or an unmatched marker.                                                                                                        | Proposed      |
| 20 | Reference target quoting and label escaping | Bare target, angle brackets when it has a space or parentheses, never percent-encoded; label escapes `\`, `[` and `]` only.                                                     | Proposed      |
| 21 | Anchors, aliases, tags, duplicate YAML keys | Rejected on read.                                                                                                                                                               | Proposed      |
| 22 | YAML sequence indentation and flow braces   | Sequence entries indented two spaces under their key; no padding inside `{}`.                                                                                                   | Proposed      |
| 23 | Cross-file outcomes (section 5)             | Each listed outcome (report, read-only, unavailable, ignored) is a proposal; the spec names only FR-EXP-07, FR-EXP-08 and FR-PRJ-07.                                            | Proposed      |

### Open, not decided here

1. **Literature block staleness.** Spec 5.5 rule 6 says the application warns before replacing a block whose content differs from what it last generated. The format stores nothing that records what was last generated, so the application cannot know. Options: (a) compare the block with a fresh regeneration from the same `bibliography.json` and style, which is deterministic and needs no format change; or (b) store a fingerprint in the start marker, which is a format addition to decide now. Option (a) is assumed by the schemas. It warns after any hand edit, which is the intended case, and never after ordinary edits.
2. **Gate S2-G01 versus the edge-cases fixture.** See section 3.2. S2-T13 must mark which fixture files are canonical.
3. **Spec text to update on approval.** Spec 5.2, 5.3, 5.5 and 5.8 should point to this document for canonical layout so the two cannot diverge. Deferred until approval so that the specification is edited once.
