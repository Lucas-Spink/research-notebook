# ADR-0021: Creating projects, and the two writes outside `_notebook/`

- Status: Proposed
- Date: 2026-09-19
- Deciders: maintainer
- Spec sections affected: 5.12, 6.3, 6.4, 6.5, 7.1, 9.4; gate S2-G06

## Context

S2-T05 lets a person create, open and locate projects and keeps recent projects and external root paths (FR-PRJ-01, 02, 03, 07). Two requirements collide with the rule that the application writes only inside a project's `_notebook/` (AGENTS.md rule 1, spec 6.3, 6.5, ADR-0020, gate S2-G06):

- FR-PRJ-01 and spec 5.12 require appending entries to the project root's `.gitignore` and `.gitattributes`.
- FR-PRJ-03 and FR-PRJ-07 require settings that belong to the machine, so they cannot live in a project (spec 5.3).

The options were put to the maintainer before implementation and the recommended ones were chosen.

## Decision

1. **Two named exceptions to "writes only in `_notebook/`", both in `nb-fs`.**
   - **The hygiene files.** `HygieneFile` has exactly two values, `.gitignore` and `.gitattributes`, so no other root file can be named. Missing entries are appended; existing bytes are never removed or changed. The new lines follow the file's own line ending, and a missing final line break is added first. The write is the same atomic replace as any other (ADR-0020), and keeps the file's permissions. A link, a folder or a read-only file in its place is refused and reported, and the project is still created. It happens only when a project is created.
   - **The settings file.** `settings.json` in the application's config folder (`%APPDATA%\<app id>` or `~/Library/Application Support/<app id>`, spec 9.4), replaced atomically. A damaged file, or one from a newer version, is reported and never overwritten.
2. **Gate S2-G06 lists the two hygiene files by name** as its only exception. Everything else at the project root, including the root folder's own contents, must be identical before and after. The test also checks the two files only gain lines.
3. **Creating a project.** The person picks the folder in a native dialog and the application never makes the project folder itself. `_notebook/` must be absent or an empty real folder (not a file, a link, or spelt in another case); anything else is refused and nothing is written. `project.yaml` is written last, so a project exists exactly when that file does. A failure part way can leave folders or files behind that the application will not remove; the next attempt is refused until they are removed by hand.
4. **What is created.** `README.md` (generated in `nb-fs`, not a notebook data file, format-v1.md 4.8), `bibliography.json` (`[]`), `project.yaml`, and empty `questions/`, `experiments/` and `styles/`. `inbox/`, `backups/`, `.history/`, `.trash/` and `exports/` are made by the code that first needs them. The texts of `project.yaml` and `bibliography.json` come from `packages/format` (`newProject`); `nb-fs` stores them without reading them, so there is still one serialiser. No citation style file is shipped, so `citation_style: "nature.csl"` names a file that does not exist until the Stage 5 style work.
5. **Folders never cross the IPC boundary as paths.** Dialogs are opened from Rust (`tauri-plugin-dialog`, Rust API only, no capability grants its commands to the webview) and the webview gets an opaque `FolderHandle`. Identifiers arrive as a validated `Ulid`. `project.yaml` goes to the webview as text and is parsed by `packages/format`.
6. **Settings shape.** `{ version: 1, recent_projects: [{id, name, path}], external_roots: { <project id>: { <root id>: <path> } } }`. The list is most recent first, capped at 20, and replaces any entry with the same project id or the same path. Locating a moved project is done by project id, so a folder holding another project is refused. Forgetting a project leaves its external root paths.
7. **Opening does not lock or decide a mode.** It reads `project.yaml` and writes nothing. The lock, the read-only banners and newer-format read-only mode are S2-T06; until then two instances can open the same project, and a newer or invalid `project.yaml` is reported and not remembered.
8. **The desktop TypeScript `lib` is ES2022** (was ES2020), because the webview now compiles `packages/format`, which uses `Object.hasOwn`. WebView2 and macOS 13's WKWebView both support it. `apps/desktop/tsconfig.json` is a protected path.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Put the ignore rules in `_notebook/.gitignore` | Keeps every write confined, but changes spec 5.12 and so the format (version increment, migration, fixtures). Can be adopted later by an ADR if the exception proves unwelcome. |
| Do not write the hygiene files; show the lines | Leaves a fresh project unprotected until the person acts, and every project would need the same manual step. |
| A new crate for settings | It would need its own exemption from `clippy.toml` and repeat the atomic write; `nb-fs` already has both. |
| Let the webview pass folder paths back | Any compromised or mistaken caller could name any folder. Handles limit it to folders the person chose. |
| Remove a half-made `_notebook/` after a failure | The application must not delete anything it did not just create in the same call, and the exception in ADR-0020 covers only temporary files. |
| Ship a default `.csl` now | Style bundling and validation belong to Stage 5. |

## Consequences

- **AGENTS.md rule 1 and the section 4 row for `crates/nb-fs` still say the application writes only inside `_notebook/`.** They need the same two exceptions. They are protected files and this change does not edit them; the maintainer must.
- **The workbook row for S2-G06** needs the exception wording that `docs/planning/stages.md` now has.
- **Not covered.** Between reading a hygiene file and replacing it, another program could change it; its change would be lost. Hard links to a hygiene file are not detected. `*.tmp` is not added to `.gitignore` because spec 5.12 does not list it (ADR-0020, open work).
- **No logging.** There is no `tracing` subscriber yet, so command errors carry a kind and no detail.
- **Tests.** `create.rs`, `hygiene.rs`, `settings.rs` and the new scenario in `fs_safety.rs` (Windows only so far; the symlink-as-`project.yaml` read test runs on Unix only). The command layer is thin and untested without a running app. The dialogs and the start screen were not driven by hand.
- **Dependencies.** `tauri-plugin-dialog` 2.7.3, pinned; it depends on `tauri-plugin-fs` for its path type, and that plugin is not registered. `serde` and `serde_json` are added to `nb-fs`; both were already in the workspace.
