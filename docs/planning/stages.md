# Development stages and gate tests (agent reference)

Read-only Markdown copy of `Development_Stages_and_Test_Gates.xlsx` for AI agents. The workbook remains the progress tracker: task status and test results are recorded there, not here. When a task or gate test changes through an ADR, update both files in the same pull request.

Completed tasks can be found from commit messages on `main`, which end with the task ID: `git log --oneline main | grep S2-T`.

## Stage summary

| Stage | Name | Weeks | Entry requirement | Goal |
| --- | --- | --- | --- | --- |
| 0 | Repository foundation | 1 | Specification v0.1 approved | Set up the monorepo, agent rules, CI on Windows and macOS, and the checks that keep AI-generated code clean before any feature code exists. |
| 1 | Technical spikes | 2 | Stage 0 gate passed | Prove the risky technologies work together before committing to them: Markdown round-trip, citations, Zotero, previews, PDF/A and the table. |
| 2 | File format and index | 5 | Stage 1 gate passed; spike ADRs merged | Build the plain-file project format, safe writing, locking, history and the disposable index, plus questions, experiments, the table and the expanded view. |
| 3 | Evidence, groups and previews | 4 | Stage 2 gate passed | Capture and version evidence, link large files, import from the inbox and VS Code, organise groups and preview artefacts. |
| 4 | Writing and references | 3 | Stage 3 gate passed | Rich-text sections with version-pinned artefact references, version updates, search and reverse lookups. Ends with an internal alpha. |
| 5 | Citations and Literature | 3 | Stage 4 gate passed | Zotero picker, bibliography cache, per-experiment citation contexts, styles and source repair. |
| 6 | Archive and export | 2 | Stage 5 gate passed | Integrity checks, manifest and verification, HTML and PDF/A exports, bundles and archived mode. |
| 7 | Cross-platform release | 3 | Stage 6 gate passed | Handoff and end-to-end suites on both platforms, build channels, signing, accessibility and performance sign-off. |

## Stage 0: Repository foundation

Set up the monorepo, agent rules, CI on Windows and macOS, and the checks that keep AI-generated code clean before any feature code exists.

Entry requirement: Specification v0.1 approved.

### Stage 0 tasks

| ID | Task | Definition of done | Spec | Human review | Agent notes |
| --- | --- | --- | --- | --- | --- |
| S0-T01 | Create the monorepo | pnpm workspaces with the layout in spec 6.2; empty packages install. The Cargo workspace is created with the Tauri scaffold in S0-T12. | 6.2 | No | Do not scaffold Tauri or the Cargo workspace (S0-T12) or add ESLint/Prettier configuration (S0-T04). Package folders get a package.json and an empty src/index.ts only. |
| S0-T02 | Add agent rules and project documents | AGENTS.md, CLAUDE.md, LICENSE (AGPL-3.0-or-later), README, CONTRIBUTING and the PR template committed from the starter kit. | 12, AGENTS.md | Yes | AGENTS.md, CLAUDE.md, LICENSE and the PR template already exist from the starter kit. Write README.md and CONTRIBUTING.md only; CONTRIBUTING should point to AGENTS.md and docs/git-workflow.md rather than repeat them. |
| S0-T03 | Record initial ADRs | ADR-0001 to ADR-0008 from spec 15.1 written using the ADR template. | 15.1 | Yes | The eight ADRs already exist in docs/adr/. Check each matches spec section 15.1 and report discrepancies; do not rewrite them. |
| S0-T04 | Configure TypeScript checks | tsconfig with strict mode and noUncheckedIndexedAccess; ESLint with typescript-eslint; Prettier; `pnpm lint`, `pnpm typecheck` and `pnpm format:check` pass. | 12.1 | No | Align the configuration the Tauri scaffold created with the repository rules. Include restricted imports mirroring .dependency-cruiser.cjs and the lint rules listed in STARTER_KIT_README.md. |
| S0-T05 | Configure architecture boundaries | dependency-cruiser rules from the starter kit enforce spec 6.3 (for example UI cannot import Tauri fs APIs; format package has no I/O). | 6.3 | Yes |  |
| S0-T06 | Configure Rust checks | rustfmt, clippy with warnings denied, and cargo-deny with deny.toml from the starter kit. | 12.1 | No | Add the workspace lints from STARTER_KIT_README.md. clippy.toml and deny.toml already exist; do not loosen them. |
| S0-T07 | Configure npm licence allow-list | `pnpm licences:check` fails on any licence outside the allow-list. | 6.1 | Yes |  |
| S0-T08 | Set up test runners | Vitest projects (unit, property, golden, fixtures) and cargo test run with an example test in each; fast-check and proptest installed. | 12.1 | No | Add one trivial passing test per Vitest project and one Rust test so every CI step runs. Add proptest as a dev-dependency. |
| S0-T09 | Create CI and nightly workflows | ci.yml runs on windows-latest and macos-latest; nightly.yml scheduled; branch protection requires CI checks. | 12.2 | Yes | The workflow files already exist. Make every ci.yml step pass; do not remove or weaken steps. Nightly and Weekly stay disabled. Branch protection is set by the maintainer on GitHub, not by you. |
| S0-T10 | Install pre-commit hooks | lefthook runs formatting, lint and typecheck on staged files. | 12.1 | No | Run `pnpm lefthook install`, then demonstrate gate test S0-G06 by showing an unformatted file is rejected. Do not change lefthook.yml to make commits pass. |
| S0-T11 | Create fixture harness | fixtures/projects/format-v1/ exists; a fixture test enumerates every fixture folder and fails if none are found. | 12.3 | No | Create the harness and folder structure only. Real fixture projects are created in S2-T13. |
| S0-T12 | Minimal Tauri window | Tauri app scaffolded in apps/desktop with the Cargo workspace at apps/desktop/src-tauri and locked-down capabilities (no fs, shell or http plugins in the webview); launches on both platforms. | 6.7 | Yes | Scaffold with create-tauri-app non-interactively (React, TypeScript, pnpm) into apps/desktop, so the Cargo workspace root is apps/desktop/src-tauri with crates under crates/. Remove every default plugin permission the webview does not need. |
| S0-T13 | Configure CODEOWNERS for protected paths | Changes to capabilities, migrations, nb-fs, format schemas and CI require maintainer review. | AGENTS.md | Yes | CODEOWNERS was filled in manually. Verify every protected path in AGENTS.md section 6 is listed; add missing ones only. |

### Stage 0 gate tests

| ID | Gate test | Type | How to run | Pass criterion | Platforms | Automated |
| --- | --- | --- | --- | --- | --- | --- |
| S0-G01 | CI runs green on both platforms | Static | Open a PR with no changes; watch ci.yml | All jobs succeed on windows-latest and macos-latest | Both | Yes |
| S0-G02 | Lint violation fails CI | Negative | Temporary PR adding an unused variable and `any` | CI fails at the lint step; PR closed afterwards | Both | Yes |
| S0-G03 | Failing test fails CI | Negative | Temporary PR with `expect(1).toBe(2)` and a failing Rust test | CI fails in both test steps | Both | Yes |
| S0-G04 | Disallowed licence fails CI | Negative | Temporary PR adding a dependency with a licence outside the allow-list | `cargo deny check` or `pnpm licences:check` fails | Both | Yes |
| S0-G05 | Boundary violation fails CI | Negative | Temporary PR importing `@tauri-apps/plugin-fs` in apps/desktop/src | `pnpm deps:check` fails with the named rule | Both | Yes |
| S0-G06 | Pre-commit hook blocks unformatted code | Manual | Commit a badly formatted file locally | Commit rejected with a formatting message | Both | No |
| S0-G07 | Tauri window launches | Manual | `pnpm --filter desktop tauri dev` on each platform | Window opens with no console errors | Both | No |
| S0-G08 | Webview has no filesystem, shell or http permissions | Static | `pnpm test:unit -- capabilities` (test parses capability JSON) | Test fails if any forbidden permission is present | Both | Yes |
| S0-G09 | Fixture harness detects missing fixtures | Negative | Run `pnpm test:fixtures` with the fixture folder empty | Harness fails with a clear message | Both | Yes |

## Stage 1: Technical spikes

Prove the risky technologies work together before committing to them: Markdown round-trip, citations, Zotero, previews, PDF/A and the table.

Entry requirement: Stage 0 gate passed.

### Stage 1 tasks

| ID | Task | Definition of done | Spec | Human review | Agent notes |
| --- | --- | --- | --- | --- | --- |
| S1-T01 | Spike: Tiptap custom nodes with Markdown | artefactRef and citation nodes parse from and serialise to the syntax in spec 5.6 and 5.7 using @tiptap/markdown's MarkdownManager outside the editor. | 5.6, 5.7 | Yes | Spike: work on a spike/ branch. Code may be discarded; the deliverable is evidence and an ADR draft. Still write the round-trip tests properly, because they carry into Stage 2. |
| S1-T02 | Spike: round-trip property harness | fast-check arbitraries generate documents with all supported nodes, references and citations. | 12.1 | Yes | The arbitraries written here become the permanent generators in packages/format/test/arbitraries.ts. |
| S1-T03 | Spike: citeproc-js in a Web Worker | Worker processes a context for numeric and author-date styles and returns clusters and bibliography after inserts and deletions. | 7.8 | No |  |
| S1-T04 | Spike: Zotero local API client in Rust | Detects not running, disabled (403) and connected; searches items; fetches CSL-JSON; records Zotero-Server-ID when present. | 7.8 | No |  |
| S1-T05 | Spike: previews on both platforms | Rust thumbnail for PNG and JPEG, pdf.js first page for PDF, SVG through img, shown in the Tauri window on Windows and macOS. | 8 | No |  |
| S1-T06 | Spike: Typst PDF/A from JSON | Embedded Typst renders one experiment JSON with a PDF figure to PDF/A-2b; user text passed only as data. | 7.12 | Yes | Spike. Pass user text to Typst only as JSON data, never by building markup strings. |
| S1-T07 | Spike: TanStack table prototype | 500 generated experiments with question header rows, read-only rich summaries and virtualisation. | 7.3 | No |  |
| S1-T08 | Spike: YAML serialisation | `yaml` library writes double-quoted strings in documented key order and preserves unknown keys. | 5.2 | No |  |
| S1-T09 | Spike: git provenance | gix reads HEAD commit and file and tree dirty state; decide gix or git CLI. | 7.4 | No |  |
| S1-T10 | Define reference machine | Hardware for performance thresholds recorded in an ADR. | 10.1 | Yes |  |
| S1-T11 | Write spike ADRs and update the specification | One ADR per spike outcome; spec updated wherever a result differs. | 15 | Yes | Summarise every spike's outcome; propose spec edits as a diff for maintainer approval rather than applying them. |

### Stage 1 gate tests

| ID | Gate test | Type | How to run | Pass criterion | Platforms | Automated |
| --- | --- | --- | --- | --- | --- | --- |
| S1-G01 | Round-trip property: generated documents | Property | `pnpm test:property -- roundtrip` with FC_NUM_RUNS=10000 | parse(serialise(doc)) deep-equals doc for every case | Both | Yes |
| S1-G02 | Round-trip golden: edge-case corpus | Golden | `pnpm test:golden -- markdown-corpus` | Nested lists, code blocks containing @ and [@...], titled links and raw HTML byte-identical after serialise(parse()) | Both | Yes |
| S1-G03 | Citation numbering property | Property | `pnpm test:property -- citation-context` | After random insert, delete and move sequences, numbers follow first appearance and each source has one entry | Both | Yes |
| S1-G04 | Zotero client status handling | Integration | `cargo test -p nb-zotero` against the mock server; manual run against current Zotero release and beta | Not running, 403 and connected states reported correctly; CSL-JSON parsed | Both | Partly |
| S1-G05 | Previews render on both platforms | Manual | Open spike preview window with sample PNG, PDF and SVG | All three visible and correctly scaled on Windows and macOS; screenshots attached | Both | No |
| S1-G06 | Typst output is valid PDF/A-2b | Golden | Nightly veraPDF step on spike output | veraPDF reports compliant | Both | Yes |
| S1-G07 | Typst treats user text as data | Security | `cargo test -p nb-export -- injection` | Notes containing #, $, and Typst function calls render literally | Both | Yes |
| S1-G08 | Table prototype scroll performance | Performance | Profile scrolling 500 rows in the webview devtools on each platform | No frame longer than 50 ms | Both | No |
| S1-G09 | Spike review | Manual | Maintainer reviews spike ADRs | Every spike passed or has an approved alternative ADR | N/A | No |

## Stage 2: File format and index

Build the plain-file project format, safe writing, locking, history and the disposable index, plus questions, experiments, the table and the expanded view.

Entry requirement: Stage 1 gate passed; spike ADRs merged.

### Stage 2 tasks

| ID | Task | Definition of done | Spec | Human review | Agent notes |
| --- | --- | --- | --- | --- | --- |
| S2-T01 | Write the normative format document and schemas | docs/format/format-v1.md and Zod schemas for every file; JSON Schemas exported to docs/format/schemas. | 5 | Yes | Write docs/format/format-v1.md and the Zod schemas, then stop for maintainer approval before any parser code. This defines the permanent on-disk format. |
| S2-T02 | Implement format parsing and serialising | packages/format parses and canonically serialises project.yaml, question files, experiment.md, artefacts.yaml and request.json. | 5.3-5.10 | Yes | Only after S2-T01 is approved. Canonical serialisation must be byte-identical; write the golden and property tests first. |
| S2-T03 | Preserve unknown content | Unknown frontmatter keys, preamble, unknown sections and passthrough blocks survive edits. | 5.5 | Yes |  |
| S2-T04 | Implement nb-fs safe writes and path validation | Atomic write with flush and rename, Windows retry, NFC and forward-slash normalisation, traversal rejection, writes restricted to _notebook. | 6.5, 9.3 | Yes | Every write in the application must go through this module. Include the fault-injection test (S2-G05) and the filesystem safety test (S2-G06). |
| S2-T05 | Create, open and locate projects | Create layout and hygiene files, open by folder, recent projects in settings, locate moved projects, external root mapping per machine. | 7.1 | No |  |
| S2-T06 | Implement lock and read-only modes | Lock with heartbeat, stale takeover, banners for every read-only reason. | 5.11, 7.1 | Yes |  |
| S2-T07 | Implement the index | nb-index in the cache directory: schema, full rebuild, incremental update keyed by file size, time and hash; FTS5 table created. | 6.6 | No |  |
| S2-T08 | Implement watcher and conflicts | External changes reload; unsaved local edits plus external change keep both versions and open the conflict view. | 7.11 | Yes |  |
| S2-T09 | Implement history, trash and version-change backups | Snapshots before overwrite with retention policy; trash for deletions; backup before first write by a new app version. | 5.11, 7.11 | Yes |  |
| S2-T10 | Implement questions and experiments | Create, edit, move, delete to trash; ULIDs; ref allocation without reuse; duplicate ref detection. | 7.2 | No |  |
| S2-T11 | Build the workspace table | Question header rows, ordering from project.yaml, sort and filter within questions, column settings persisted, virtualised rows. | 7.3 | No |  |
| S2-T12 | Build the expanded experiment view | Section editors (plain Markdown without references yet), side-by-side Results Notes and Interpretation, autosave with status indicator. | 7.3, 7.7 | No |  |
| S2-T13 | Create fixture projects | minimal, typical, large (generated by committed script), edge-cases and malformed fixtures under format-v1. | 12.3 | Yes | Once merged, fixture folders are immutable. Generate the large fixture by script; do not commit it. |

### Stage 2 gate tests

| ID | Gate test | Type | How to run | Pass criterion | Platforms | Automated |
| --- | --- | --- | --- | --- | --- | --- |
| S2-G01 | Canonical serialisation of fixtures | Golden | `pnpm test:fixtures` | serialise(parse(file)) is byte-identical for every file in every fixture | Both | Yes |
| S2-G02 | Model round-trip property | Property | `pnpm test:property -- project-model` | Generated projects serialise and parse to deep-equal models | Both | Yes |
| S2-G03 | Unknown content preserved | Integration | `pnpm test:unit -- preserve-unknown` using edge-cases fixture | Unknown keys, preamble, unknown sections and passthrough blocks unchanged after an edit and save | Both | Yes |
| S2-G04 | Malformed files open read-only | Integration | `pnpm test:fixtures -- malformed` | Read-only mode reported; file hashes unchanged after opening, editing attempts and closing | Both | Yes |
| S2-G05 | Atomic write survives crash | Fault injection | `cargo test -p nb-fs --test atomic_write` | Killing the writer at random points leaves the old or new complete file, never partial | Both | Yes |
| S2-G06 | Nothing outside _notebook changes | Filesystem safety | `pnpm test:fs-safety` | Directory snapshot of the project root outside _notebook identical before and after the integration suite | Both | Yes |
| S2-G07 | Index rebuild equality | Integration | `cargo test -p nb-index --test rebuild` | Normalised dump of a rebuilt index equals the incrementally maintained index | Both | Yes |
| S2-G08 | External edit and conflict | Integration | `pnpm test:unit -- watcher-conflict` plus manual edit in VS Code | External edit reloads; concurrent unsaved edit produces conflict with both versions | Both | Partly |
| S2-G09 | Lock behaviour | Integration | `cargo test -p nb-fs --test lock` | Second instance read-only; stale lock takeover requires confirmation flag | Both | Yes |
| S2-G10 | Newer format opens read-only | Integration | `pnpm test:fixtures -- future-format` | Project with format_version 2 opens read-only with banner reason | Both | Yes |
| S2-G11 | Moved project resolves | Integration | `cargo test --test move_project` copying fixture to a new temporary path | All references and captured files resolve without repair | Both | Yes |
| S2-G12 | History retention | Unit | `cargo test -p nb-fs -- history_retention` with mocked clock | Snapshot counts match policy at 1 day, 7 days, 90 days and beyond | Both | Yes |
| S2-G13 | CRLF and BOM input | Unit | `pnpm test:unit -- encoding` | Files with CRLF and BOM parse; written files are LF without BOM | Both | Yes |
| S2-G14 | Large project opens quickly | Performance | `pnpm bench -- open-large` | Table interactive in under 2 s with warm index; rebuild under 20 s | Both | Yes |
| S2-G15 | Windows-created and macOS-created fixtures | Cross-platform | Nightly handoff job (early version) | Fixture created on each platform opens and saves canonically on the other | Both | Yes |

## Stage 3: Evidence, groups and previews

Capture and version evidence, link large files, import from the inbox and VS Code, organise groups and preview artefacts.

Entry requirement: Stage 2 gate passed.

### Stage 3 tasks

| ID | Task | Definition of done | Spec | Human review | Agent notes |
| --- | --- | --- | --- | --- | --- |
| S3-T01 | Implement copy capture | Hash while copying to temporary file, verify, atomic placement, Windows-safe names, collision suffixes, version naming, dedupe. | 7.4 | Yes | Capture must never modify the source file. Extend the filesystem safety test scenario. |
| S3-T02 | Implement link mode and relink | Threshold and override; link records; availability checks; unavailable state; relink with ranked candidates requiring confirmation. | 7.4 | No |  |
| S3-T03 | Implement update from source | Detect changed source hash and offer a new version; never automatic. | FR-EVD-06 | No |  |
| S3-T04 | Record git provenance on capture | Repository path, commit, file and tree dirty flags stored with each version. | FR-EVD-12 | No |  |
| S3-T05 | Implement inbox import | Validate requests, create artefacts or versions, move payloads, remove processed requests, list invalid requests with errors. | 5.10 | Yes |  |
| S3-T06 | Build the VS Code extension | Add file to experiment command, project discovery, experiment quick pick via packages/format, role and mode options, atomic request writing with provenance. | 7.10 | Yes | The extension uses packages/format for reading and writes only inbox requests. |
| S3-T07 | Implement discovery | Folder scan with include and exclude globs and platform clutter excludes, cancellable with progress, marks captured sources. | FR-EVD-09 | No |  |
| S3-T08 | Build the groups tree | Create, rename, nest, delete; Move to and Add to as separate actions by drag, keyboard and menu; ordering; Ungrouped area; large groups collapsed. | 7.5 | No |  |
| S3-T09 | Implement thumbnail cache | Cache directory keyed by content hash and size; bounded cache size. | FR-PRV-04 | No |  |
| S3-T10 | Implement previews | Image, PDF, SVG, delimited tables including gzip, text and scripts, notebooks, HTML (external only) and fallback, all bounded. | 8 | Yes |  |
| S3-T11 | Build the preview panel | Metadata, versions, groups, availability, provenance and open, reveal, VS Code, copy path and open project actions. | 7.6 | No |  |

### Stage 3 gate tests

| ID | Gate test | Type | How to run | Pass criterion | Platforms | Automated |
| --- | --- | --- | --- | --- | --- | --- |
| S3-G01 | Capture dedupe and versioning | Property | `pnpm test:property -- capture` and `cargo test -p nb-fs -- capture` | Same content creates no version; changed content creates v2; v1 bytes unchanged | Both | Yes |
| S3-G02 | Group operations preserve data | Property | `pnpm test:property -- groups` | Random operation sequences keep every artefact ID, all file bytes and ordering; no duplicate item within a group | Both | Yes |
| S3-G03 | Nothing outside _notebook changes during capture | Filesystem safety | `pnpm test:fs-safety` | Source files unchanged in bytes and modification time after capture, relink and discovery | Both | Yes |
| S3-G04 | Inbox import while app closed | Integration | `cargo test --test inbox_import` | Requests written with no app running import on next open; invalid requests stay with error | Both | Yes |
| S3-G05 | VS Code extension writes valid requests | Integration | `pnpm test:vscode` | Request validates against schema; payload hash matches; provenance commit and dirty flags correct in a test repository | Both | Yes |
| S3-G06 | Relink never auto-applies | Integration | `cargo test -p nb-fs -- relink` | Candidates returned ranked; artefact unchanged until confirm command is called | Both | Yes |
| S3-G07 | Discovery on 50,000 files | Performance | `pnpm bench -- discovery` | Progress within 500 ms; cancel within 1 s; excluded folders not traversed | Both | Yes |
| S3-G08 | Bounded table preview | Integration | `cargo test -p nb-preview -- bounds` | 2 GB CSV: read limits respected, memory increase under 50 MB; gzip works | Both | Yes |
| S3-G09 | SVG scripts do not execute; HTML not rendered | Security | `pnpm test:e2e -- preview-security` | Script-bearing SVG triggers no script; HTML artefact offers only external open | Both | Yes |
| S3-G10 | Windows-safe filenames | Property | `cargo test -p nb-fs -- filename_sanitise` (proptest) | Generated names are valid on Windows, NFC, at most 64 characters, and unique after case folding | Both | Yes |
| S3-G11 | Large Results tree performance | Performance | `pnpm bench -- results-tree` | 2,000 artefacts render collapsed in under 200 ms | Both | Yes |
| S3-G12 | Keyboard-only group operations | Accessibility | Manual test and `pnpm test:a11y` | Create, move and add memberships without a mouse; no serious axe violations | Both | Partly |
| S3-G13 | Previews on both platforms | Manual | Open typical fixture previews on Windows and macOS | All preview types render or show fallback states; screenshots attached | Both | No |

## Stage 4: Writing and references

Rich-text sections with version-pinned artefact references, version updates, search and reverse lookups. Ends with an internal alpha.

Entry requirement: Stage 3 gate passed.

### Stage 4 tasks

| ID | Task | Definition of done | Spec | Human review | Agent notes |
| --- | --- | --- | --- | --- | --- |
| S4-T01 | Wire section editors to the format package | Methods, Results Notes and Interpretation load and save through packages/format with one live editor at a time. | 7.7 | No |  |
| S4-T02 | Implement @ autocomplete | Trigger rules, search by display name and filename, icons, group path, version, keyboard navigation, Escape, ARIA combobox. | FR-EDT-04 | No |  |
| S4-T03 | Implement reference chips | Current label, filename and version on hover or focus, activation opens pinned version preview. | FR-EDT-06 | No |  |
| S4-T04 | Implement newer-version updates | Indicators, Update reference, Update all in section. | FR-EDT-07 | No |  |
| S4-T05 | Handle detached references | References to removed artefacts render detached with the last label and are preserved on save. | FR-EDT-08 | No |  |
| S4-T06 | Rewrite labels and targets on save | All references match current metadata after every write. | FR-EDT-09 | Yes |  |
| S4-T07 | Render read-only table summaries | Cells render Markdown summaries with chips as static elements, no editor instances. | FR-TBL-05 | No |  |
| S4-T08 | Implement search | FTS5 search across sections, titles, display names and filenames; grouped results opening at the location. | 7.9 | No |  |
| S4-T09 | Implement Referenced in lookup | Artefact panel lists every reference with experiment and section. | FR-SRC-03 | No |  |
| S4-T10 | Run internal alpha | Maintainer records one real experiment end to end on a copy of a real project and files issues. | 13 | Yes | Manual task for the maintainer. Help by preparing a copy of a real project and a checklist; do not run it on the original. |

### Stage 4 gate tests

| ID | Gate test | Type | How to run | Pass criterion | Platforms | Automated |
| --- | --- | --- | --- | --- | --- | --- |
| S4-G01 | Reference syntax written correctly | Golden | `pnpm test:golden -- references` | Inserted references match spec 5.6 exactly | Both | Yes |
| S4-G02 | Files readable in other tools | Manual | Open typical fixture in VS Code preview and as an Obsidian vault | Links open the correct files; text readable | Both | No |
| S4-G03 | Rename updates references | Integration | `pnpm test:unit -- rename-artefact` | All labels updated in files; IDs and versions unchanged | Both | Yes |
| S4-G04 | Round-trip with references | Property | `pnpm test:property -- roundtrip` | Extended arbitraries including references in all sections pass | Both | Yes |
| S4-G05 | Autosave crash window | Fault injection | `pnpm test:e2e -- autosave-crash` | Killing the app 2 s after typing loses at most 1.5 s of input; file never partial | Both | Yes |
| S4-G06 | Search speed and coverage | Performance | `pnpm bench -- search` | Results under 200 ms on large fixture; matches in every section type | Both | Yes |
| S4-G07 | Referenced in is complete | Property | `pnpm test:property -- reverse-refs` | Lookup equals brute-force scan of all files | Both | Yes |
| S4-G08 | Single live editor | Unit | `pnpm test:unit -- editor-instances` | At most one editor instance mounted at any time | Both | Yes |
| S4-G09 | Autocomplete accessibility | Accessibility | `pnpm test:a11y` plus NVDA on Windows and VoiceOver on macOS | Combobox announced and operable by keyboard | Both | Partly |
| S4-G10 | Internal alpha complete | Manual | Maintainer dogfood on a copy of a real project | One real experiment recorded end to end; blocking issues fixed | Both | No |

## Stage 5: Citations and Literature

Zotero picker, bibliography cache, per-experiment citation contexts, styles and source repair.

Entry requirement: Stage 4 gate passed.

### Stage 5 tasks

| ID | Task | Definition of done | Spec | Human review | Agent notes |
| --- | --- | --- | --- | --- | --- |
| S5-T01 | Integrate Zotero status and onboarding | Status indicator and guidance for enabling the local API. | FR-CIT-01 | No | All Zotero calls go through nb-zotero in Rust. Use recorded responses for tests; never call a real Zotero from CI. |
| S5-T02 | Build the citation picker | Slash menu Cite item, debounced search, multi-select, locator, prefix and suffix, keyboard operable. | FR-CIT-03 | No |  |
| S5-T03 | Serialise citation nodes | Pandoc citation syntax with citekey grammar; hand-written forms preserved. | 5.7 | Yes |  |
| S5-T04 | Maintain bibliography.json | Insert adds CSL-JSON; refresh action; ok, trashed and missing states; server ID mismatch prompt. | 5.9, FR-CIT-07 | Yes |  |
| S5-T05 | Implement citation contexts and Literature block | Per experiment, Methods then Interpretation; one entry per source; numbering by first appearance; block regenerated and written to file with change warning. | FR-CIT-09, FR-CIT-10 | Yes |  |
| S5-T06 | Implement style management | Bundled in-text styles, import .csl, reject note styles, copy active style to styles/. | FR-CIT-11 | No |  |
| S5-T07 | Build source details panel | Metadata, Open in Zotero, DOI, Open PDF when available. | FR-CIT-04 | No |  |
| S5-T08 | Implement source repair | Replace a missing or trashed source with another item, updating citekeys in text. | FR-CIT-08 | Yes |  |
| S5-T09 | Implement Cited by lookup | List experiments citing a source. | FR-CIT-12 | No |  |

### Stage 5 gate tests

| ID | Gate test | Type | How to run | Pass criterion | Platforms | Automated |
| --- | --- | --- | --- | --- | --- | --- |
| S5-G01 | Literature consistency property | Property | `pnpm test:property -- literature` | Random citation edits keep Literature equal to cited sources, numbered by first appearance, one entry per source | Both | Yes |
| S5-G02 | Style change does not alter text | Integration | `pnpm test:unit -- style-switch` | Section text hashes unchanged apart from the literature block | Both | Yes |
| S5-G03 | Pandoc agrees with the app | Golden | `pnpm test:golden -- pandoc-citeproc` (CI installs Pandoc) | Normalised Pandoc bibliography text equals app Literature for fixtures | Both | Yes |
| S5-G04 | Rendering with Zotero closed | Integration | `pnpm test:unit -- offline-citations` | Existing citations render from bibliography.json; picker shows offline state | Both | Yes |
| S5-G05 | Server ID mismatch | Integration | `cargo test -p nb-zotero -- server_id` with mock | 412 and mismatched IDs prompt before overwrite; no data lost | Both | Yes |
| S5-G06 | Trashed and missing sources | Integration | `pnpm test:unit -- source-repair` | States shown; replacement updates citekeys; citation text otherwise unchanged | Both | Yes |
| S5-G07 | Zotero contract | Contract | `cargo test -p nb-zotero --test contract` on recorded responses; manual run against current Zotero release and beta | All contract cases pass | Both | Partly |
| S5-G08 | Note styles rejected | Unit | `pnpm test:unit -- style-validation` | Note-class CSL styles rejected with message | Both | Yes |

## Stage 6: Archive and export

Integrity checks, manifest and verification, HTML and PDF/A exports, bundles and archived mode.

Entry requirement: Stage 5 gate passed.

### Stage 6 tasks

| ID | Task | Definition of done | Spec | Human review | Agent notes |
| --- | --- | --- | --- | --- | --- |
| S6-T01 | Build the integrity check | Report of missing files, unresolved references, external files and source problems, each resolvable or acknowledgeable. | FR-ARC-01 | No |  |
| S6-T02 | Generate the manifest | manifest.csv with path, size, time, SHA-256, experiments and groups. | FR-ARC-02 | No |  |
| S6-T03 | Implement Verify | Re-hash files against the manifest and report differences. | FR-ARC-03 | Yes |  |
| S6-T04 | Implement git bundle option | git bundle for each repository referenced by provenance. | FR-ARC-04 | No |  |
| S6-T05 | Build HTML export | Static pages per question and experiment, downscaled figures, sampled tables, relative links to originals. | FR-ARC-05 | No |  |
| S6-T06 | Build PDF/A-3 export | Typst template over notebook.json with embedded notebook.json and bibliography.json, combined project bibliography as a fresh context. | FR-ARC-06 | Yes | PDF/A validity is checked by veraPDF in the nightly workflow; make the export example the workflow calls. |
| S6-T07 | Build machine-readable export | notebook.json, JSON Schemas and Markdown renderings. | FR-ARC-07 | No |  |
| S6-T08 | Build bundles | Notebook bundle and full archive as ZIP64, stored mode for compressed formats, FAT32 warning, registered extension. | FR-ARC-08 | Yes |  |
| S6-T09 | Implement archived mode and unarchive | Archived flag, read-only opening, unarchive with backup and migration. | FR-ARC-09, FR-ARC-10 | Yes |  |
| S6-T10 | Generate README with recovery instructions | _notebook/README.md explains the folder and includes the Pandoc command. | A.3 | No |  |

### Stage 6 gate tests

| ID | Gate test | Type | How to run | Pass criterion | Platforms | Automated |
| --- | --- | --- | --- | --- | --- | --- |
| S6-G01 | PDF/A-3b validity | Golden | Nightly veraPDF step on typical fixture export | Compliant; embedded notebook.json and bibliography.json present | Both | Yes |
| S6-G02 | Export golden files | Golden | `pnpm test:golden -- export` | notebook.json and HTML structure match golden files | Both | Yes |
| S6-G03 | Verify detects corruption | Property | `cargo test -p nb-archive -- verify` | A single flipped byte in any file is reported | Both | Yes |
| S6-G04 | ZIP64 full archive round-trip | Integration | `cargo test -p nb-archive --test zip64 -- --ignored` (nightly only) | Archive over 4 GB extracts byte-identical | Both | Yes |
| S6-G05 | Notebook bundle without data | Integration | `cargo test -p nb-archive -- notebook_bundle` | Opens with files unavailable; pointing to data folder matches by checksum | Both | Yes |
| S6-G06 | Archived projects are not written | Filesystem safety | `pnpm test:fs-safety -- archived` | No file under the project changes while archived project is open and used | Both | Yes |
| S6-G07 | Pandoc recovery command works | Integration | CI runs the README command on the typical fixture | Pandoc exits 0 and output contains the bibliography | Both | Yes |
| S6-G08 | Archive crosses platforms | Cross-platform | Nightly handoff job with archive step | Archive made on each platform verifies and opens read-only on the other | Both | Yes |

## Stage 7: Cross-platform release

Handoff and end-to-end suites on both platforms, build channels, signing, accessibility and performance sign-off.

Entry requirement: Stage 6 gate passed.

### Stage 7 tasks

| ID | Task | Definition of done | Spec | Human review | Agent notes |
| --- | --- | --- | --- | --- | --- |
| S7-T01 | Build the cross-OS handoff jobs | Nightly jobs create and edit a project on Windows, verify and edit on macOS, and the reverse. | 12.2 | Yes |  |
| S7-T02 | Build the end-to-end suite | WebdriverIO with the Tauri service covering create, capture, group, reference, cite, archive on both platforms. | 12.1 | No |  |
| S7-T03 | Separate stable and development builds | Different application identifiers and settings; development build read-only on projects not marked as test copies. | ADR-0008 | Yes |  |
| S7-T04 | Sign and notarise macOS builds | Universal build signed and notarised in the release workflow. | 9.4 | Yes | Needs Apple signing credentials as GitHub secrets. Write the workflow and document the required secrets; the maintainer adds them. |
| S7-T05 | Sign Windows builds | Signed installer produced in the release workflow. | 9.4 | Yes | Needs a Windows signing certificate or signing service as GitHub secrets. Write the workflow and document the required secrets. |
| S7-T06 | Add opt-in updater | Signature-verified updates, off by default, version-change backup on first write. | FR-HIS-04 | Yes |  |
| S7-T07 | Accessibility pass | Keyboard, focus, contrast and screen reader fixes; axe-core clean. | 10.2 | No |  |
| S7-T08 | Performance pass | All section 10.1 thresholds met and recorded. | 10.1 | No |  |
| S7-T09 | Register bundle file association | Double-clicking a bundle opens the application on both platforms. | FR-PRJ-02 | No |  |
| S7-T10 | Publish user and format documentation | User guide, format-v1 documentation and recovery guide published with the release. | 5, A.3 | Yes | Manual review by the maintainer before publishing. |

### Stage 7 gate tests

| ID | Gate test | Type | How to run | Pass criterion | Platforms | Automated |
| --- | --- | --- | --- | --- | --- | --- |
| S7-G01 | Handoff both directions | Cross-platform | `nightly.yml` handoff jobs | Windows to macOS and macOS to Windows jobs green on three consecutive nights | Both | Yes |
| S7-G02 | End-to-end core workflow | E2E | `pnpm test:e2e` | Create, capture, group, reference, cite, archive pass on both platforms | Both | Yes |
| S7-G03 | Development build protection | Integration | `pnpm test:e2e -- dev-build-readonly` | Development build opens non-test project read-only | Both | Yes |
| S7-G04 | Clean machine installers | Manual | Install on clean Windows 11 and macOS virtual machines | Launch without security overrides; uninstall leaves project files untouched | Both | No |
| S7-G05 | Update creates backup | Integration | `pnpm test:e2e -- version-change-backup` | Backup exists before first write by new version | Both | Yes |
| S7-G06 | Recovery without the application | Manual | Uninstall app; open project in text editor; run Pandoc command | All notes readable; experiment renders with citations | Both | No |
| S7-G07 | Accessibility sign-off | Accessibility | `pnpm test:a11y`; keyboard-only and screen reader walkthrough | No serious or critical axe violations; walkthrough completed on both platforms | Both | Partly |
| S7-G08 | Performance sign-off | Performance | `pnpm bench` | Every threshold in spec 10.1 met on reference machine | Both | Yes |
| S7-G09 | Mutation score on critical modules | Mutation | `pnpm test:mutation` and `cargo mutants -p nb-fs` | Mutation score at least 80% for packages/format, packages/citations and nb-fs | Both | Yes |
| S7-G10 | Acceptance criteria sign-off | Manual | Walk through spec section 13 | AC-01 to AC-20 all confirmed with evidence links | Both | No |
