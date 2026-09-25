# ADR-0042: "Referenced in" also stays in-memory, not `nb-index`

- Status: Proposed
- Date: 2026-09-26
- Deciders: maintainer
- Spec sections affected: 6.6, 7.9 (FR-SRC-03); gate S4-G07

## Context

S4-T09 implements the "Referenced in" lookup: for one artefact, every
experiment and section that references it. ADR-0041 (S4-T08, project search)
already named this exact task as the next place its own decision would come
up again: `nb-index`'s `refs` table (`experiment`, `section`, `artefact`,
`version`, `char_offset`) exists in the schema precisely to answer this
question, but nothing populates or queries it — the same gap ADR-0041 found
for search.

Wiring it now would still need everything ADR-0041 already ruled out for
search: a new Tauri command receiving rows parsed by `packages/format` in the
webview over IPC (AGENTS.md rule 2: `nb-index` itself never parses), a
mapping from parsed references to `refs` rows, and a way to keep the table in
step with every save. None of that is smaller for this task than it was for
search; if anything it is larger, because a reference's location also has to
survive edits to sections it is *not* in (an experiment's Methods changing
must not stale the `refs` rows for its Results Notes).

`Arranged` already holds every experiment's section text in memory, loaded up
front by `model/load.ts` the same way search's own index is built from it.
The only piece search didn't need is finding artefact-reference nodes inside
a section's raw Markdown at all (search only tokenises section text as plain
words); "Referenced in" needs the actual references, so accuracy matters
more here than for search's word index.

## Decision

"Referenced in" is implemented entirely in `packages/format`, over data the
application already holds, exactly as ADR-0041 anticipated:

1. `packages/format/src/notebook/references.ts` adds `buildReferenceIndex`
   (built once from `Arranged`, mirroring `buildSearchIndex`) and
   `referencedIn` (`ReferenceIndex`, one artefact ULID → its locations).
2. Locations are found by parsing each recognised section's stored Markdown
   with the same real parser the live editor uses
   (`editor/markdown.ts`'s `parseSectionMarkdown`) and walking the resulting
   Tiptap JSON for `artefactRef` nodes, not by a regex over raw text. This is
   the point on which this task cannot simply copy search's approach:
   `summary.ts`'s `ARTEFACT_REF_LINK` regex (used for table-cell summaries,
   FR-TBL-05) finds a reference-shaped link anywhere in the text, including
   inside a code fence, where the real inline tokenizer never runs. A
   regex-based scan here would report a reference that the editor itself
   would never treat as one — visibly wrong once someone writes `` `[a
   fake link](x "art:...")` `` in a code block. Reusing the actual parser
   keeps AGENTS.md rule 2 (one parser) exact, not just nominal.
3. `apps/desktop`'s `NotebookView` builds the index once with `useMemo` from
   `arranged`, the same lifecycle `SearchPanel` already has, and passes it
   down to wherever an artefact's preview panel is shown.
4. `nb-index`'s `refs` table stays unpopulated. This continues, rather than
   reopens, ADR-0041's decision.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Wire `nb-index`'s `refs` table: an IPC command populating it from parsed sections on open and after every save | Same IPC/mapping/keep-in-step cost ADR-0041 already ruled out for search, for a table nothing else reads yet either. |
| Scan raw Markdown text with `summary.ts`'s `ARTEFACT_REF_LINK` regex, the way table-cell summaries do | Cheaper, but wrong inside a code fence or any other passthrough block the real tokenizer would never enter — a second, divergent notion of "reference" (AGENTS.md rule 2). |
| Build the reference index lazily, only artefacts whose panel has been opened, the way search's `useAllArtefacts` defers artefact names | `Arranged`'s section text is already fully loaded up front (unlike a separate `artefacts.yaml` per experiment); there is no separate fetch to defer, so eager, memoised construction is simpler for no extra cost. |

## Consequences

- **S2-G14 stays open**, for the same reason ADR-0041 left it open: this task
  does nothing to move `nb-index` from unused schema to a live, warm-opened
  index.
- **A future task that wires `nb-index`** is free to replace
  `buildReferenceIndex`'s in-memory scan with a query against the `refs`
  table without changing `referencedIn`'s signature or the panel that calls
  it.
- **Correctness over the `refs` table's own `char_offset` column**: this
  lookup reports an experiment and section, not a character offset, since
  nothing yet needs finer placement than S4-G07 asks for
  ("experiment and section").
- **Tests.** `packages/format/src/notebook/references.test.ts` (single and
  multiple locations, unknown sections excluded, a code-fenced reference
  excluded) and `reverse-refs.property.test.ts` (S4-G07: the index-based
  lookup equals an independent brute-force scan of generated experiments, for
  every artefact). `PreviewPanel.test.tsx` covers the panel's own rendering.
- **Windows only.** Everything here was run on Windows.
