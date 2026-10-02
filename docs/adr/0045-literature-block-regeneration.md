# ADR-0045: Literature block regeneration

- Status: Proposed
- Date: 2026-10-02
- Deciders: maintainer
- Spec sections affected: 5.5 (rules 1 and 6), 7.8 (FR-CIT-06, FR-CIT-09, FR-CIT-10); gates S5-G01, S5-G02, S5-G03; follows up ADR-0012

## Context

S5-T05 makes each experiment's Literature block a generated part of `experiment.md`. Four questions were open:

1. **How does the app know a block was edited by hand?** Spec 5.5 rule 6 says it warns before replacing a block that differs from what it last generated, but the format stores nothing that records what was generated. format-v1.md, open question 1, offered (a) compare with a fresh regeneration, or (b) add a fingerprint to the start marker, which is a format change.
2. **Where does the block get written?** A save of Methods or Interpretation changes the citations, so the block is stale the moment the text is saved.
3. **What does the citeproc worker protocol look like in production?** ADR-0012 adopted the pure reducer from the S1-T03 spike, noted that the `postMessage` wiring was untested, and left the production protocol to this task.
4. **What styles and locale does it render with before S5-T06 (style management) exists?** `project.yaml` names `nature.csl`, but nothing yet copies a style into `styles/`.

## Decision

1. **Staleness is option (a); there is no format change.** Before replacing a stored block, the app regenerates it from the stored text, `bibliography.json` and the style, and compares. A difference means the block was changed by someone else, and the person is asked (`Replace` or `Keep my edits`) before it is replaced. A block they keep is not asked about again until its text changes. Section text is saved either way, so a refusal never loses words. The known cost is that a changed `bibliography.json` or style also makes the stored block differ from a fresh render, so the person may be asked after a source refresh; a style change is regenerated without asking by passing the style the block was generated under.
2. **One write.** `editExperimentSection` takes an optional regenerated block and replaces the section and the block in a single `experiment.md` write. `editExperimentLiterature` rewrites only the block, for changes that touch no text. The block is computed before the save from the text about to be stored, and is dropped, not written, if the citations of the state the save really runs on differ from those it was computed from. The next save regenerates it.
3. **The citation context** (FR-CIT-09) is `citationContext(body)` in `packages/format`: Methods, then Interpretation, each in document order, whatever order the file stores them in. It uses the section editor's own parser, so hand-written author-in-text forms count, and citations inside blocks the editor keeps verbatim (a table) are found by the same patterns.
4. **Empty blocks.** Nothing cited and no block gives no block. Nothing cited and a block gives an empty block (the two markers), so a block the person relies on does not vanish.
5. **Worker protocol.** One request, one reply: `{ id, input }` to `{ id, result }`, where the input is the clusters, the bibliography items, the style and the locale. The worker keeps no state, so a bad style cannot affect the next render. Messages are checked on both sides because they cross a boundary. The pure reducer from the spike is kept as the engine under it. The webview starts the worker lazily with Vite's `?worker` import; a failure to render leaves the block as it was.
6. **Entry layout.** Entries are rendered by the style, converted from citeproc's HTML to Markdown text (emphasis kept, other tags dropped, entities decoded), under a `## Literature` heading inside the block. Numbered entries form a tight list; other entries are separate paragraphs.
7. **Styles before S5-T06.** The app bundles two in-text styles (numeric and author-date) and an `en-US` locale, written for this project rather than copied from the CSL repository, whose styles are CC BY-SA and not compatible with AGPL-3.0-or-later as published. A project whose `citation_style` file is not in `styles/` renders with the bundled numeric style. S5-T06 replaces this fallback with importing and copying styles.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Fingerprint in the start marker (open question 1, option b) | A format change needs a version increment, a migration, fixtures and maintainer approval, and a hand edit of the marker would defeat it. Option (a) needs none of that. |
| Write the block in a second write after the section | A crash between the two leaves citations and Literature disagreeing on disk. One write cannot. |
| Remove the block when nothing is cited | Silently deletes markers the person may have relied on; an empty block is the less destructive choice. |
| A stateful worker that keeps the engine between renders | Faster for incremental chip rendering, but a failed style would poison later renders. The measured cost of a stateless render is small (below). Incremental rendering can use the kept reducer when chips need it (S5-T07). |
| Test the worker in a real thread | jsdom has no `Worker` and Node's `worker_threads` is a different API; the package may not import Node core modules. |

## Consequences

- **Tests.** `literature.property.test.ts` (S5-G01), `style-switch.test.ts` (S5-G02) and `pandoc-citeproc.golden.test.ts` (S5-G03) cover consistency, text immutability and agreement with Pandoc. The Pandoc test needs Pandoc on `PATH` and fails without it; the main CI job does not install it yet (`.github/workflows/ci.yml` is a protected path and was not changed).
- **The worker boundary** is tested over a structured-clone channel (`MessageChannel`), and the production bundle was run in a bare scope with no DOM and no Node globals and answered correctly. Starting it with `new Worker` in the Tauri webview, including under its content security policy, is a manual check.
- **Performance.** Rendering 200 citations of 60 sources took 30 to 80 ms in Node on the development machine (one render; a save renders up to twice, the second usually from the memo), against NFR-PERF-09's 300 ms. This was not measured on the reference machine or in the webview.
- **A type-declaration exception.** `citeproc` ships no types, so its hand-written declaration is pulled into every program that compiles the engine with a triple-slash reference and one line-level ESLint exception, because `apps/desktop/tsconfig.json` is protected and an `import` cannot load an ambient module declaration.
- **A new workspace link.** `apps/desktop` now depends on `packages/citations` (`workspace:*`); `packages/citations` exports its source like `packages/format` does.
- **Documents.** format-v1.md open question 1 can be closed as option (a). Style change and source refresh call the same planning function (`planRegeneration`); the UI that triggers them is S5-T06.
