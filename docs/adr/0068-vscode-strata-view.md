# ADR-0068: A STRATA view in VS Code that takes dropped files

- Status: Proposed
- Date: 2026-11-12
- Deciders: maintainer
- Spec sections affected: 7.10 (FR-VSC-03, FR-VSC-04, FR-VSC-07); 7.4 (FR-TBL-05, cell text, noted below)
- Amends: ADR-0034, ADR-0067 point 5

## Context

The extension added a file through a right-click command and, with more than one experiment, a quick pick for the experiment. Testing showed the quick pick is easy to lose (it closes when focus moves) and that filing several files means repeating the whole sequence for each. The aim of the extension is fewer steps, so the experiments should be on screen and files should be droppable on them.

## Decision

1. **A view named STRATA in the Explorer** lists each project in the workspace, its questions and, under each, its experiments. A project is found from a workspace folder the way FR-VSC-02 finds one from a file: the folder's own `_notebook/project.yaml` or the nearest one above it. With one project the project level is not shown. Questions and experiments are read through `packages/format` as for the quick pick (`listExperiments`), grouped by question in numeric order; experiments whose question has no file come last, as in the application's Unassigned.
2. **Files dragged from the Explorer onto an experiment are added to it.** VS Code supplies the drop as `text/uri-list` (checked against the installed `@types/vscode` 1.138). Each `file:` URI becomes the same inbox request as the right-click commands, through one shared function (`captureFile`), so hashing, the copy-or-link threshold, git provenance and the atomic write are not duplicated. Dropping on a question or a project does nothing and says so.
3. **What a drop adds** is chosen with a button in the view's title: Result (default), Method, or Link (no copy). It is remembered per workspace in VS Code's workspace state, never written to the project, and shown in the view's description. Result and Method use automatic mode (FR-VSC-04's defaults). The right-click entries stay.
4. **Only files inside the project are added.** A request records its source relative to the project (spec 5.10, ADR-0034 point 5), so a file from elsewhere on disk, a folder, or anything that is not a `file:` URI (a web address, an untitled editor, a remote workspace) is skipped, and the message says why. Several files in one drop are added one by one, with one summary message.
5. **The view follows the project.** A watcher on `_notebook/questions/*.md` and `_notebook/experiments/*/experiment.md` refreshes it after a short pause, so experiments made in the application appear. The watcher and the view only read; the extension still writes nothing except inbox requests (FR-VSC-06).
6. **Pure parts are tested without VS Code**: `project-tree.ts` (grouping, project discovery, the inside-the-project check) and `drop.ts` (reading the URI list). `strata-view.ts` and `capture.ts` are thin adapters over `vscode`; their behaviour was checked against a stub of the API, not a real VS Code window.

## Related change: table cells keep their line breaks (FR-TBL-05)

`cellMarkdownParts` now keeps the lines and paragraph breaks of a section instead of joining them with spaces, so a cell reads like the editor it was typed in. The single-line summaries (`summariseMarkdown`, `summariseMarkdownParts`) are unchanged. Two cases in `rows.test.ts` that asserted the one-line text for a multi-line section changed their expected strings for this reason (see that pull request).

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Keep the quick pick and make it harder to dismiss | The pick is still one more step per file, and a quick pick cannot take several files at once. |
| A webview panel instead of a tree view | Needs its own drop handling and a content security policy for no gain; a tree view gets VS Code's drop support, theming and keyboard handling for free. |
| Remember the last experiment and skip the pick | Hidden state that sends files somewhere the person cannot see. |
| Allow files outside the project, with an absolute source | Needs the external-root machinery (ADR-0031), which the extension deliberately does not know about. |

## Consequences

- One more contribution point (a view and two commands) and a file watcher in the extension host while a workspace is open.
- A drop is only as reliable as VS Code's drag payload; if a future VS Code stops sending `text/uri-list` for Explorer drags, dropping does nothing and the right-click commands remain.
- Latency from a drop to an artefact is the application's inbox polling (ADR-0067), about 1.5 seconds with the project open.
- Not verified in a real VS Code window when this was written; the view, the drop and the title button need a manual pass.
