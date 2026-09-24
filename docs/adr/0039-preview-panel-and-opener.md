# ADR-0039: Preview panel, the opener module, and linked-artefact availability

- Status: Proposed
- Date: 2026-09-24
- Deciders: maintainer
- Spec sections affected: 6.3 (nb-opener), 7.6 (FR-PRV-01, FR-PRV-02), FR-EVD-07, FR-EVD-08, FR-PRJ-07; builds on ADR-0031, ADR-0038

## Context

S3-T11 builds the preview panel: an artefact's metadata, versions, group locations, availability, provenance, and five actions (FR-PRV-02), around S3-T10's `PreviewView`. Two things the spec asks for had no engine at all yet:

- **No opener exists.** `clippy.toml` already reserves an exception for it — *"Only nb-fs (and nb-git / opener modules for processes) may allow these lints"* — but nothing implements it.
- **No command resolves an artefact's `source` to a live availability.** ADR-0031 (S3-T02) built `nb_fs::link::stat_link`/`observe_link` but explicitly left resolving `source.root`/`source.path` to "the project loader," which had not been written.

## Decision

1. **Scope.** Ships: `nb-opener` (a new crate); the `commands/projects/open/` module (four commands); `features/preview-panel` (the panel component, embedding `features/preview`'s `PreviewView`). Not wired into `ResultsTree` or `App.tsx`, matching how S3-T08 and S3-T10 were left unwired; only the latest version is shown in the embedded preview, with older versions listed by metadata only; no relink UI, and no write of a rechecked `checked` timestamp (ADR-0031 §1 already decided availability is never persisted, so a read-only panel has nothing to write).
2. **`nb-opener`: a hand-rolled crate, not a plugin, behind a `Launcher` trait.** `clippy.toml`'s own wording — reserving `std::process::Command::new` for an "opener module" — only makes sense if that module calls it directly; a plugin would hide the call entirely and need no such exception. Every action (`open_file`, `reveal_file`, `open_folder`, `open_uri`, `copy_to_clipboard`) takes a `Launcher`, so every test but one runs against a fake that records the call; the one exception (below) spawns `clip.exe` for real, since it is headless and safe in CI.
   - **Open file / reveal / open folder / open URI**, per spec 9.4: Windows uses `cmd /C start "" <target>` (open) and `explorer /select,<path>` (reveal); macOS uses `open <path>` and `open -R <path>`.
   - **Open in VS Code** builds `vscode://file/...` exactly as spec 9.4's two literal examples show it — an inserted slash before a Windows drive letter, no doubled slash for a POSIX path that already has one — then opens that URI the same way as any other.
   - **Copy path** pipes the text into `clip` (Windows) or `pbcopy` (macOS) over stdin and waits for it to exit, rather than spawning-and-forgetting like the other actions, since a person copying a path expects it to be on the clipboard by the time the button click returns.
3. **No clipboard dependency.** `tauri-plugin-clipboard-manager` was added, inspected, and removed again: it pulls roughly twenty transitive crates, including X11/Wayland clipboard backends for a Linux target the project does not ship (spec 9.1). `clip`/`pbcopy` are OS built-ins that do exactly one thing and need no dependency, matching AGENTS.md §7.1 ("short, tested code" over a new dependency). This keeps the dependency checklist trivially satisfied: nothing new was added to `Cargo.lock` besides the internal `nb-opener` path crate itself.
4. **Availability resolution lives in the desktop crate, not `nb-fs`.** A `source` may legitimately point anywhere under the project root (`source.root: "project"`) or a configured external root (`source.root: <ulid>`, resolved through the `external_root_status`/`set_external_root` commands that already existed). Unlike `_notebook/` writes, nothing here is canonicalised or confined the way `nb-fs`'s own confinement checks are: these actions only ever read metadata or launch another program, never write, so a `source` value that happened to resolve outside its intended root would only let a person open or reveal a file the OS already lets them open by hand — no new risk `nb-fs`'s stricter rules exist to prevent. `SourcePath` still rejects `..` and absolute forms lexically, reusing `nb_fs::ProjectRelPath::parse`'s existing algorithm.
5. **Availability is a plain enum, not an error.** `Availability::{Available, Missing, RootUnresolved, RootFolderMissing}` are all ordinary outcomes returned `Ok`, matching how `LinkStatus`, `FileRead::Missing` and `RelinkExpectation` are already modelled elsewhere: an expected outcome is data, not a thrown failure. `linked_artefact_availability` calls `nb_fs::link::stat_link` (metadata only, never bytes) on the resolved path and reports the result; nothing is written, matching ADR-0031 §1.
6. **`PreviewView`'s existing callbacks are finally wired.** ADR-0038 (S3-T10) left `onOpenExternally`/`onOpenInVsCode` as bare callbacks for "a later task." Here they call the same `open_captured_file_action`/`open_linked_file_action` commands the panel's own action row uses, so a notebook's "Open in VS Code" button and the panel's own do the same thing.
7. **A link-mode artefact shows no embedded content preview.** `previewPlanFor` gives it `{kind: "other", reason: "linked"}`, the same fallback S3-T10 already built for exactly this case (no command reads a linked file's content); the panel does not add a second one.
8. **`Availability::Available.size` is `u32`, not `u64`.** Specta refuses to export `u64` to TypeScript (precision loss as a JS number). The size is shown to the person, never compared or relied on, so it is capped at `u32::MAX` rather than sent as a string — the same choice S3-T10 made for table dimensions.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| `tauri-plugin-opener` for open/reveal | `clippy.toml`'s own exception for "the opener module" reads as an instruction to write this module, not to hide it behind a plugin; a hand-rolled ~150-line crate, fully covered by injected-launcher tests, was preferred per AGENTS.md §7.1. |
| `tauri-plugin-clipboard-manager` for copy path | ~20 new transitive crates, several Linux-only, for one `writeText` call `clip`/`pbcopy` already does with zero dependencies. |
| The raw Web Clipboard API from the webview | Known to be unreliable in a Tauri webview (focus and permission issues), and would need `@tauri-apps/api` reasoning the frontend rule (only `ipc/` calls Tauri) already forbids. |
| Confining a resolved source path to the project root or external root, the way `nb-fs` confines writes to `_notebook/` | Adds a canonicalise-and-prefix-check for a read-only, launch-another-program action where the OS already permits the same access by hand; the lexical `SourcePath` check already rejects the traversal forms that would matter. |
| Persist a rechecked `checked` timestamp on every panel open | ADR-0031 §1 already decided availability is never persisted; adding a write path here would reopen that decision for a read-only panel, and needs a save/history flow this task does not otherwise touch. |
| Wire the panel into `ResultsTree`/`App.tsx` now | No task has assembled that screen yet; `ResultsTree` (S3-T08) and `PreviewView` (S3-T10) were both left the same way, each fully tested standalone. |

## Consequences

- **Spec 6.3's component table** should gain an `nb-opener` row (process launching only, confined to what a caller already resolved and checked) when the maintainer next updates it, as ADR-0037 already flagged for `nb-fs`'s cache row.
- **The `real_launcher_pipes_text_through_clip` test writes to the real Windows clipboard** when it runs, the only test in this task that is not fully hermetic — flagged for review; it changes no file and pops no window, but it is a real side effect on whatever machine runs it.
- **macOS's branches of `nb-opener` (`open`, `open -R`, `pbcopy`) are untested here**, and on this Windows machine they do not even compile (`#[cfg(target_os = "macos")]`), the same caveat ADR-0014 recorded for the original preview spike.
- **A file above 4 GiB reports its availability size capped, not exact.** Harmless for display; would need a string-encoded size if this were ever compared rather than shown.
- **Tests:**
  - `crates/nb-opener/tests/{actions,clipboard,vscode_uri}.rs` and one in-crate real-clipboard test.
  - `src/commands/projects/open/{types,resolve}.rs` in-file unit tests (temp projects and a temp settings store, no Tauri state).
  - `packages/format/src/notebook/groups.test.ts` (`groupLocationsOf`).
  - `features/preview-panel/**/*.test.ts(x)`.
  - No addition to `crates/nb-fs/tests/fs_safety.rs`: the new read (`stat_link` on a resolved source path) reuses the same already-audited primitive `link_scenario` already exercises there, and the resolution logic itself lives outside `nb-fs`, so it is outside that harness's scope.
- **Not tested:** the panel mounted in a real window; macOS in any form.
