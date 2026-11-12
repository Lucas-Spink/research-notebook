# ADR-0069: The VS Code view follows the projects STRATA has open

- Status: Proposed
- Date: 2026-11-12
- Deciders: maintainer
- Spec sections affected: 7.10 (FR-VSC-02, FR-VSC-03); 5.11 (lock, read only)
- Amends: ADR-0068 points 1 and 4, ADR-0034 point 5 (the latter in a later change, noted below)

## Context

The STRATA view in VS Code lists the projects of the workspace folders only. Testing showed it does not notice when projects are opened or closed in the desktop app, does not find a project when the VS Code folder is one of its external roots (which has no `_notebook/` at or above it), and says nothing about several app windows being open at once.

## Decision

1. **The extension reads, and never writes, the desktop app's per-machine `settings.json`** (Tauri's app config folder for the identifier `io.github.Lucas-Spink.researchnotebook`: `%APPDATA%` on Windows, `~/Library/Application Support` on macOS, `$XDG_CONFIG_HOME` or `~/.config` on Linux). It uses only `recent_projects` (`id`, `name`, `path`) and `external_roots` (project id, then root id, to a folder). The file is `nb-fs`'s; this ADR makes those fields a contract: a change to them needs the extension changed in the same pull request.
2. **A file it cannot understand gives no information**, never an error: damaged JSON, no `version`, or a `version` above 1 (what `nb-fs` writes) make the view fall back to the workspace folders alone. Entries that are malformed are skipped. Windows verbatim prefixes (`\\?\`) in stored paths are removed, as `nb-opener::plain_path` does.
3. **Open is read from each project's `_notebook/.lock`**, through the `LockFile` schema in `packages/format`: a heartbeat under five minutes old, or one in the future, is open (ADR-0022). A stale lock is closed. Text that is not a lock, such as one caught partly written, is unknown and is shown as not open. The process id and host are not used.
4. **Several app instances need nothing extra.** Each holds the lock of the project it has open, so the projects open in any number of windows are all found. A drop goes to that project's inbox and the instance holding its lock imports it (ADR-0067). If two instances have the same project, only the one holding the lock writes, so it is the one that imports.
5. **What the view lists:** *Open in STRATA* first, then *Recent*, with workspace projects included in whichever applies, each project once. A project whose folder or `project.yaml` has gone is dropped. Dropping on a project that is not open still writes the request, which is imported when the app next opens it, and the message says so.
6. **Following is by polling** (as ADR-0024 and ADR-0067): every three seconds while the view is visible, and when it becomes visible, redrawing only when the projects, their open state or their external roots changed. The view no longer needs a workspace folder to be shown.
7. **External roots.** A file in the folder of one of a project's external roots is added with `source: {root: <root id>, path}`, the path relative to that folder, instead of being refused; a file inside the project still uses `project` (the project wins if both hold it) and, of several roots, the deepest wins. The request format already allows this (`planInboxImport` keeps the source as given, and a test now pins both copy and link, and that the same path under another root is a different artefact). Git provenance is recorded only when the repository lies inside the project (spec 5.2 forbids `..`), so an external-root file usually has none. The right-click commands find the project the same way, through the app's remembered projects as well as the workspace, and ask which only when more than one project's folders hold the file. This amends ADR-0034 point 5, which said the extension always writes `project`.
8. **Structure.** `strata-settings.ts`, `lock-state.ts`, `known-projects.ts` and `notes.ts` are pure and tested with injected reading; `read-known.ts` does the file reading; only `strata-view.ts` uses the `vscode` module. The view's behaviour was not checked in a real VS Code window.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Only VS Code workspace folders, plus an "Add project" command | Needs adding every project by hand and cannot know external-root folders. |
| The app writes a purpose-built "open projects" file | A cleaner contract, but needs `nb-fs` (protected) and Rust changes; reading what exists gives the same result now. It can replace point 1 later without the view changing. |
| Ask the app over a socket or Tauri event | New protocol and capabilities for what files already say; the app may not be running. |

## Consequences

- The extension depends on a private file of the app. A change to those fields in `nb-fs` will not fail the extension's tests; keeping the contract is by review (TODO(#issue): a shared fixture read by both sides).
- A crash leaves a lock that shows as open for up to five minutes.
- A project the app has dropped from its 20 recent entries is found only through a workspace folder.
- The Linux and macOS locations are taken from Tauri's rules and have not been tried on those systems.
