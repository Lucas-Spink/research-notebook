# Strata

A desktop research notebook for computational research. Strata connects your
research questions, experiments, evidence files, observations, interpretation
and literature in one place, without taking your files away from you.

A **project** is an ordinary folder. Everything Strata writes lives in its
`_notebook/` subfolder as plain Markdown, YAML and CSL-JSON files, so the record
stays readable in any text editor, and renderable with Pandoc, even if Strata is
not installed. Strata never writes, moves, renames or deletes anything outside
`_notebook/`, so your analysis files are safe.

<!-- SCREENSHOT: main window.
     Save the image as docs/images/main-window.png, then delete this comment
     and the placeholder line below, and uncomment the image line.
![Strata showing questions and experiments in the table view](docs/images/main-window.png)
-->

> **Screenshot placeholder:** the main table view with a few questions and
> experiments. Save as `docs/images/main-window.png`.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Features](#features)
- [How to use Strata](#how-to-use-strata)
- [Your files and your data](#your-files-and-your-data)
- [For developers](#for-developers)
- [Contributing](#contributing)
- [Licence](#licence)

## Install

Strata currently ships for **Windows 11** (macOS is planned).

1. Open the [Releases page](https://github.com/Lucas-Spink/research-notebook/releases)
   and download the latest `Strata_<version>_x64-setup.exe`.
2. Run the installer. It installs for your own account and does not need
   administrator rights.
3. Open **Strata** from the Start menu. Right-click it and choose **Pin to
   taskbar** to keep it handy.

### The "unknown publisher" warning

Early releases are signed with a self-signed certificate, which Windows does not
trust by default, so SmartScreen may warn you. To continue, choose **More info**,
then **Run anyway**. If you would rather make Windows trust the signature, each
release also includes a `.cer` file: import it into **Trusted Root
Certification Authorities** and **Trusted Publishers** for your user account.
Only do this if you trust where you downloaded the release from.

Uninstalling Strata never touches your project folders.

## Quick start

1. Open Strata and, under **New project**, type a project name and choose
   **Create project…**. Pick a new or existing folder. Strata creates a
   `_notebook/` folder inside it and leaves everything else alone.
2. Choose **Add question** and type a research question, for example
   *Do batch effects explain the signal?*
3. Choose **Add experiment** under that question.
4. Fill in the experiment's Motivation, Methods, Results Notes and
   Interpretation, then drag in the files that show what you found.

Next time, pick your project from **Recent projects**, or use **Open project…**
and choose the folder.

<!-- SCREENSHOT: start screen.
     Save as docs/images/start-screen.png and uncomment.
![The Strata start screen with the new project form and recent projects](docs/images/start-screen.png)
-->

> **Screenshot placeholder:** the start screen showing **New project** and
> **Recent projects**. Save as `docs/images/start-screen.png`.

## Features

### Questions and experiments in a table

- One row per experiment, grouped under the research question it belongs to.
- Columns for Motivation, Methods, Results, Results Notes, Interpretation and
  Literature. Resize and hide columns, and filter or sort within each question.
- Click a cell (or press Enter or F2 on it) to edit in place, or open the
  expanded view to edit every section of one experiment.
- Experiments get stable references (`EXP-001`, and so on) that are never reused,
  even after deletion, so you can cite them in your own notes.
- Move an experiment to another question, or drag to reorder.

<!-- SCREENSHOT: expanded experiment.
     Save as docs/images/expanded-experiment.png and uncomment.
![The expanded view of one experiment](docs/images/expanded-experiment.png)
-->

> **Screenshot placeholder:** the expanded view of one experiment. Save as
> `docs/images/expanded-experiment.png`.

### Evidence you can trust later

- Capture figures, tables, scripts and other files by drag and drop or the file
  picker. Small files are copied into the project; large files are linked and
  recorded with a checksum. You can override the choice for each capture.
- Every captured file is an **artefact** with immutable **versions**. A changed
  source file offers a new version; Strata never creates versions on its own.
- Linked files that go missing are marked unavailable without altering your
  notes, and Strata helps you relink them.
- Provenance is recorded when the source is inside a git repository.
- Previews for images, PDFs, SVG, delimited tables and text or script files,
  with thumbnails in the Results cell.

### Groups

- Organise an experiment's results into nested groups, like folders, without
  moving any real files.
- An artefact can belong to several groups at once. **Move to group** and **Add
  to group** are separate actions. Deleting a group never deletes artefacts.

<!-- SCREENSHOT: results and groups.
     Save as docs/images/results-groups.png and uncomment.
![An experiment's results arranged in groups with thumbnails](docs/images/results-groups.png)
-->

> **Screenshot placeholder:** the Results pane with groups and thumbnails. Save
> as `docs/images/results-groups.png`.

### Rich text with live references to evidence

- Write with paragraphs, bold, italic, inline code, lists, links, headings, block
  quotes and code blocks. Anything the editor does not support, such as tables
  and raw HTML, is kept exactly as written.
- Type `@` to insert a reference to one of the experiment's artefacts. It appears
  as a chip pinned to a version. If a newer version exists, the chip says so and
  offers **Update**, or **Update all in section**.
- Edits save automatically a second after you stop typing.

### Citations with Zotero

- Search your Zotero library and insert citations in Methods and Interpretation,
  with page locators, prefixes and suffixes.
- Strata builds the Literature section for you in the citation style you choose,
  and you can import your own `.csl` style.
- Citation data is stored in the project, so citations still render when Zotero
  is closed. Zotero is optional, and Strata only ever talks to it on your own
  computer.

### Canvas

- Switch from the table to a **Canvas** for each question: a pannable, zoomable
  board where you pin result figures from any experiment and add plain-text
  notes, joined to figures with lines.
- A notes summary shows what you have written about the question's results.
- **Pop out canvas** opens the canvas in its own window, so the table and the
  canvas can sit on different screens.

<!-- SCREENSHOT: canvas.
     Save as docs/images/canvas.png and uncomment.
![The canvas with pinned figures and notes](docs/images/canvas.png)
-->

> **Screenshot placeholder:** the canvas with pinned figures and a note. Save as
> `docs/images/canvas.png`.

### Search

Search titles, section text, artefact names and filenames across the whole
project, with results grouped by experiment.

### Protection for your record

- **History:** the previous content of any notebook file is snapshotted before it
  is overwritten, and you can browse, compare and restore snapshots.
- **Bin:** deleting moves files to a bin; emptying it is a separate, confirmed
  step.
- **Conflicts:** if a file changes on disk while you have unsaved edits, Strata
  keeps both versions and lets you choose.
- **Read-only safety:** if a project is already open elsewhere, was written by a
  newer version, or has a file Strata cannot parse, Strata opens it read-only
  and says why rather than risk damaging it.
- **Integrity check:** lists missing files, broken references and missing
  sources, so you can fix or acknowledge each one.

### Archive and export

- Write a manifest of every evidence file with its checksum, and verify the
  project against it later.
- Export static HTML, PDF/A, or machine-readable JSON with Markdown versions of
  every section.
- Create a notebook bundle, or a full archive of the whole project, as a single
  file. Archived projects open read-only.

<!-- SCREENSHOT: archive and export.
     Save as docs/images/archive.png and uncomment.
![The archive and export panel](docs/images/archive.png)
-->

> **Screenshot placeholder:** the archive and export panel. Save as
> `docs/images/archive.png`.

### Light and dark mode

Switch with the **Dark mode** toggle.

## How to use Strata

### A typical workflow

1. **Ask.** Add a question that your experiments will help answer.
2. **Plan.** Add an experiment and write its Motivation and Methods.
3. **Capture.** Run your analysis as usual, in your own tools. Drag the output
   files onto the experiment's Results cell. Strata copies or links them and
   records a checksum.
4. **Group.** Arrange results into groups, such as *Quality control* and
   *Final figures*.
5. **Interpret.** In Results Notes and Interpretation, type `@` to refer to
   specific figures and tables, and insert citations from Zotero.
6. **Compare.** Use the canvas to lay out figures and notes for a whole question.
7. **Archive.** Run the integrity check, write the manifest, export, and archive
   the project when you are done.

### Capturing files from VS Code

The repository includes a VS Code extension in `extensions/vscode/` that adds
**Research Notebook: Add file to experiment** to the Explorer and editor
context menus. It finds the project above the file, lets you pick an experiment,
and leaves a request that Strata imports when the project is open (or next time
it is opened). The extension writes nothing else. It is not yet part of the
release download, so build it from source for now.

### Using Zotero

1. In Zotero, enable the local API in **Settings → Advanced** (the exact wording
   depends on your Zotero version). Strata shows a message with instructions if
   it is switched off.
2. Keep Zotero running while you search for and insert citations. Existing
   citations keep working without it.

### Working across computers

A project is a folder, so you can keep it in git, a synced folder or a USB drive
and open it on another Windows computer. Large files you linked rather than
copied are found through **external roots**: a label in the project (such as
*Lab shared drive*) that each computer points at its own folder.

## Your files and your data

- Everything Strata writes is inside the project's `_notebook/` folder.
- Strata has no telemetry or analytics and makes no network connections other
  than to Zotero on your own computer (`127.0.0.1:23119`).
- Notebook files are plain text. The full file format is documented in
  [`docs/format/format-v1.md`](docs/format/format-v1.md).

## For developers

### Technology

- **Desktop shell:** Tauri 2 (Rust backend, WebView2 on Windows, WKWebView on
  macOS).
- **Interface:** React and TypeScript in strict mode, in a pnpm workspaces
  monorepo.
- **Notebook format:** plain Markdown, YAML and CSL-JSON, parsed and
  serialised by a single package (`packages/format`).

See [`docs/spec/specification.md`](docs/spec/specification.md) section 6.1
for the full technology stack and section 6.2 for the repository layout.

### Repository layout

```
apps/desktop/       Tauri application (React frontend, Rust backend crates)
packages/format/     Notebook file parsing and serialisation
packages/citations/  Citation contexts and citeproc handling
extensions/vscode/   VS Code capture extension
docs/                Specification, format reference, ADRs, testing guide
fixtures/projects/   Fixture notebook projects used by the test suites
```

### Getting started

Requirements: Node.js as pinned in [`.nvmrc`](.nvmrc) and pnpm as pinned in
`packageManager` in [`package.json`](package.json).

```sh
pnpm install
pnpm check
```

`pnpm check` runs the static checks (lint, type check, formatting,
architecture boundaries) plus the fast unit, property and golden test
suites. See [`package.json`](package.json) for the full list of scripts and
[`docs/testing-guide.md`](docs/testing-guide.md) for what each test layer
covers and how to write new tests.

To run the app in development, use `pnpm tauri dev` from `apps/desktop/`.

## Contributing

Read [`AGENTS.md`](AGENTS.md) before making any change — it is binding for
human and AI contributors alike. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for how to propose a change.

## Licence

Licensed under the GNU Affero General Public License v3.0 or later. See
[`LICENSE`](LICENSE).
