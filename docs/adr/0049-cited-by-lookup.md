# ADR-0049: "Cited by" is an in-memory index over the citation context

- Status: Proposed
- Date: 2026-10-04
- Deciders: maintainer
- Spec sections affected: 7.8 (FR-CIT-12), 5.7; gates S5-G01, S5-G04

## Context

S5-T09 lists the experiments that cite a source. ADR-0042 already decided
that the sibling "Referenced in" lookup is built in memory from `Arranged`
rather than through `nb-index`'s unwired tables, and the same reasoning
applies: the text of every experiment is already loaded, and `nb-index` must
never parse notebook files (AGENTS.md rule 2).

The open question specific to citations is what counts as "cites". The
Literature block (FR-CIT-09, FR-CIT-10) already defines it: the citation
context, Methods then Interpretation, parsed by the editor's own parser.

## Decision

1. `packages/format/src/notebook/citedBy.ts` adds `buildCitedByIndex` and
   `citedBy`, mirroring `buildReferenceIndex` and `referencedIn`.
2. The index is built from `citationContext`, so an experiment cites a source
   exactly when the source appears in its Literature block. A citation in
   Results notes, a code span or a code fence is not a citation, as in the
   Literature block.
3. An experiment appears once per source, however often it cites it, in
   project order (questions in order, then unassigned experiments). Section
   names are not reported: FR-CIT-12 asks for experiments.
4. `NotebookView` builds the index with `useMemo` from `arranged` and passes
   it to the Sources pane. `SourceDetailsPanel` shows a Cited by list under
   the metadata, and choosing an entry opens that experiment through the same
   selection path search results use.
5. The lookup reads project files only, so it works with Zotero closed
   (FR-CIT-06). Nothing is written and the on-disk format is unchanged.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Count every section, including Results notes | Would list an experiment whose Literature block does not contain the source. |
| Scan Markdown with a regex | A second notion of citation (AGENTS.md rule 2). |
| Populate an `nb-index` table | Same cost ADR-0041 and ADR-0042 ruled out. |

## Consequences

- A citation in an experiment's Results notes is not listed, because the
  Literature block does not include it either.
- A future task wiring `nb-index` can replace the scan without changing
  `citedBy`'s signature.
- **Tests.** `citedBy.test.ts`, `cited-by.property.test.ts` (the lookup equals
  an independent scan of generated experiments) and the Cited by cases in
  `SourceDetailsPanel.test.tsx`.
- **Windows only.** Everything here was run on Windows.
