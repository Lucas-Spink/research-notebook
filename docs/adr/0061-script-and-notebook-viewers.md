# ADR-0061: Script and notebook viewers

- Status: Proposed
- Date: 2026-10-11
- Deciders: maintainer
- Spec sections affected: 8 (previews), 6.7; issue #104; amends ADR-0038 points 1, 3 and 7. No change to chapter 5.

## Context

Issue #104 asks for Python, R and Jupyter files to be added to an experiment's results and read inside the application. Three things stood in the way:

- **Scripts were only linked.** The Code folder recorded each script in place, as a linked method artefact. ADR-0038 point 1 gives linked artefacts details only, because no command reads a file outside `_notebook/`. A script could therefore never be previewed.
- **The text preview is a skim.** Spec 8 shows 500 lines from 1 MiB, with no line numbers, colour or search. A notebook showed only its language and kernel.
- **A notebook is untrusted data.** It can hold HTML, script and large images in its saved output.

## Decision

1. **Scripts are copied into the project.** The Code folder's picker now captures a copy under the experiment's `methods/` folder and records a method artefact of type `script`, instead of linking in place. A script already linked keeps working as before and shows details only. The picker accepts only approved script formats and names any other file with the approved list.
2. **One registry of approved formats**, `features/preview/model/scriptFormats.ts`. Each entry has a lower-case extension, a view (`code` or `notebook`) and an optional highlight language. The preview plan, the viewer's language and the picker's validation all read it. Adding a format is one line. Matching is case-insensitive, and the file's name is kept as it is. Initially: `py`, `r`, `ipynb`, and plain code views for `sh`, `smk`, `nf`, `wdl`, `jl` and `sql`.
3. **Rust reads further for scripts, and enforces the bound.**

   | Type | Where | Bound |
   | --- | --- | --- |
   | Script | `nb_preview::text::sample_script` | 4 MiB read, 20,000 lines |
   | Notebook body | `nb_preview::notebook::notebook_body` | 16 MiB. A larger file is refused before it is read, because half a JSON document is not a notebook. |

   The skim of other text stays at 1 MiB and 500 lines. Both new commands take a validated `VersionPath`, open the file through `nb-fs`, and only read.
4. **The code viewer is read-only.** It shows the file name, language and line count, and offers line numbers (not copied with a selection), search, word wrap and Open externally. Highlighting is a small hand-written lexer for Python and R. It only decides colour, and its tokens always rebuild the line exactly (a property test).
5. **A notebook is drawn as its saved cells.** The webview validates the JSON with hand-written guards (nbformat 4 only) and draws:
   - Markdown cells, through a small reader that builds a tree of values. No HTML string is ever made, so markup in a cell is shown as text. Links are shown but not followed, and images as their description.
   - Code cells with highlighting and execution numbers, and the saved text, error and stream outputs, with terminal colour codes removed and each output cut at 50,000 characters.
   - Cells that can be folded one at a time or all at once.

   Saved images and HTML output are **named, not drawn**. The page's CSP has no `data:` in `img-src` (ADR-0038 point 5, asserted in `csp.test.ts`), and HTML in a notebook may carry script. A table saved as HTML is shown through its plain-text form. A damaged, unsupported or oversized notebook gets a reason and its details, never a crash.
6. **No execution anywhere.** Nothing runs a script or notebook cell. No outside address is loaded from a notebook.
7. **Exports are unchanged in code.** The HTML export already lists method artefacts under "Methods files" with a link to each copied version, and the PDF export already lists every artefact with its type and files. New tests pin that scripts and notebooks are listed, that their contents are not embedded, and that no script or frame is written.
8. **No dependencies are added.** Validation uses guards in place of Zod in the desktop package, because it has none of its own.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Read linked scripts in place through a new `nb-fs` read path | A new read outside `_notebook/` in a protected crate, and an amendment to ADR-0038 point 1. The maintainer chose copying. |
| Offer both linking and copying | More interface and tests; not asked for. |
| A syntax highlighter and a Markdown sanitiser as dependencies | Each needs the section 7 checklist. A small lexer and a tree-building reader cover Python and R and are safe by construction. |
| Draw saved notebook images | Needs `data:` in `img-src`, which ADR-0038 deliberately left out. |
| Render notebook HTML after sanitising | A sanitiser is a new dependency, and the plain-text form already holds a table's content. |
| Zod in the desktop package | The package has no dependency on it. Guards keep the change to no new dependencies; moving to Zod later is a small change inside `model/notebook.ts`. |

## Consequences

- **Scripts picked before this change** stay linked. They show details only until they are added again.
- **A copied script is a second copy.** If the original changes, adding it again records a new version (the existing capture rules).
- **A notebook above 16 MiB** shows its details with a reason, not its cells.
- **Tests:**
  - `crates/nb-preview/tests/script_preview.rs` (bounds).
  - `scriptFormats`, `highlight` (with a property test), `codeSearch`, `notebook`, `markdown` and `load` under `features/preview/model/`.
  - `ScriptViews.test.tsx` (viewer behaviour and hostile notebook content).
  - `evidence-capture.test.*` (copy and format validation).
  - `scriptExport.test.ts` (exports).
- **Not tested:**
  - The viewer in a real webview, including scrolling a 20,000-line script.
  - Open externally on macOS.
- **Documents:** spec 8's text and notebook rows describe the skim; they should gain the script and notebook-body bounds when the spec is next revised.
