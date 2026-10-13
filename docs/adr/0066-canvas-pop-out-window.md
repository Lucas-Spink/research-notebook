# ADR-0066: The canvas can pop out into its own window

- Status: Proposed
- Date: 2026-10-13
- Deciders: maintainer
- Spec sections affected: 7.13 (new FR-CNV-07). Amends ADR-0022 point 7 (two windows on one project) and ADR-0064 point 8 (switching between Table and Canvas). No change to the file format: no new key, no new version.

## Context

The canvas and the table are two views of one notebook (ADR-0064), shown one at a time in one window. When writing notes beside figures, the maintainer wants the table on one screen and the canvas on another, so that the experiment text and the canvas can be read together.

ADR-0022 point 7 records that two windows on one project were not built. This decision builds the one case that is wanted: a second window that shows only the canvas, for the project already open in the main window.

## Decision

1. **A second window, labelled `canvas`, created by Rust.** The main window's **Pop out canvas** button asks Rust to create it (`open_canvas_window`); asking again brings it to the front. The window is given the project as a `FolderHandle` and whether the project is writable, which it asks for once it starts (`canvas_window_context`). It never holds a path (AGENTS.md rule 8). Window commands are `async`, and the window event handler hands its work to the async runtime, because creating a window from a synchronous command or an event handler deadlocks the main thread on Windows (documented on Tauri's `WebviewWindowBuilder`).
2. **One process, so nothing is acquired twice.** Both windows share the picked folders, the project lock and the watcher registry. The canvas window never takes or releases the lock and never starts, polls or stops the watcher. The main window keeps the lock and closing the project closes the canvas window.
3. **The main window is the only watcher poller.** The watcher hands each batch out once, so two pollers would each see part of it. The main window passes each batch on with a `ProjectFilesChanged` event. The canvas window reads the notebook again, after a short quiet, when a question, an experiment or its evidence changed. It ignores changes to canvas files, which are its own saves while it is open.
4. **One writer for the canvas while the window is open.** The canvas file save compares the hash it last read (ADR-0065), so two writers would lose edits to "changed". While the canvas window is open the main window does not offer its Canvas view (the Table and Canvas switch disables Canvas), does not edit canvases, and reads the canvas files again when they change and when the window closes. Before the window opens, the main window saves what is being typed, writes any waiting canvas edit and shows the table.
5. **The canvas window edits only the canvas.** Its edits are the canvas's notes, cards, lines and pins, written to canvas files. The Results panel in it only browses and pins; it cannot add, rename, group or remove an artefact (the panel takes a narrow `ResultsAccess` with `writable: false`, not the table's editing). Inserting a citation into a note adds the source to `bibliography.json` as it does in the table window; each window reads `bibliography.json` again when the other changes it, so citations in notes keep their labels in both.
6. **Opening a result is the table's work.** "Open" on a result card sends `OpenResultRequested` and brings the main window to the front, which opens the result in its side pane.
7. **Dropped files go to the window that received them.** Drag and drop events carry window positions and a drop captures evidence into an experiment, which is a table edit. They are sent only to the window that received them (`emit_to`), and drop targets are held per window label. The canvas window never asks to receive drops, so a file dropped on it does nothing.
8. **A capability for each window.** `capabilities/default.json` stays for `main`. `capabilities/canvas.json` is for `canvas` and adds `core:window:allow-destroy`: the canvas window's close handler writes pending edits and then destroys the window, and without the permission the window cannot be closed. The main window is not given it. Neither grants `fs:`, `shell:` or `http:` (`capabilities.test.ts`).
9. **Closing.** Closing the canvas window saves pending edits first. Closing the main window destroys the canvas window. Either way the main window is told (`CanvasWindowChanged`) and offers its Canvas view again.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Both windows edit canvases | Each window holds its own copy of the canvas and its own saver. They would meet "changed" on every second save and drop edits, or need a shared write queue across webviews. |
| Hold the canvas state in Rust and show it from both windows | Moves business logic into commands (AGENTS.md section 4) and rewrites the saver, for a view that one window can own. |
| A second application process | The project lock is per process, so the second would be read-only, and nothing is shared. |
| Let the canvas window poll the watcher too | `poll` drains the batch, so each window would see only part of the changes. |
| Full Results editing in the canvas window | Needs experiment files written from two windows; the maintainer wants the table edited only in the table. |
| Pass the project in the window's URL | Not relied on: how a packaged build treats a query string on the app URL was not checked, and a command behaves the same in development and in a packaged build. |

## Consequences

- Closing the **main** window destroys the canvas window without waiting for it, so a canvas edit made in the last 800 ms before may not be written. Closing the canvas window itself saves first.
- A canvas open in its own window is read-only in the main window's Canvas notes pane, which follows the files.
- `NotebookView` has a small amount of pop-out wiring, the largest piece left in a file already over its length guide.
- Documents to change: spec 7.13 (FR-CNV-07), ADR-0022 point 7 (amended), `docs/testing-guide.md` (Rust tests that create windows).
- Tests: the window label and the changes that matter to each window are pure functions with unit tests; the canvas window, the pop-out hook and the main window's behaviour are tested with fake APIs; drop targets per window and the capability files are tested. Creating a real window is not covered by an automated test; it was checked by hand on Windows.
