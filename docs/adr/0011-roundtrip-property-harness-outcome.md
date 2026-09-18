# ADR-0011: Round-trip property harness scope and known Markdown collisions

- Status: Proposed
- Date: 2026-09-18
- Deciders: maintainer
- Spec sections affected: 12.1

## Context

S1-T02 spiked a fast-check property harness generating documents with the
node types the S1-T01 spike implemented, to prove `parse(serialise(doc))`
deep-equals `doc`. The Agent notes for S1-T02 state the arbitraries written
here become the permanent generators in
`packages/format/test/arbitraries.ts`.

## Decision

Keep `arbitraries.ts` as the permanent generator module (as instructed) and
extend it in Stage 2 rather than replacing it. Evidence:

- `arbitraries.ts` generates `textNode` (line 64), `artefactRefNode` (line
  69, spec 5.6 shape) and `citationNode` (line 100, spec 5.7 shape),
  composed into `paragraphNode` (line 140) and `document` (line 153).
- `packages/format/src/roundtrip.property.test.ts` checks
  `parse(serialise(doc))` deep-equals `doc` and passes at the committed
  default of 200 runs (`FC_NUM_RUNS`, line 9).
- While building the harness, two genuine Markdown round-trip hazards were
  found and are documented in `arbitraries.ts:10-22`: a `!` immediately
  before an artefact reference is silently reinterpreted as an image
  (dropping the node), and a paragraph starting with a block-marker
  character (`-*+#>~\`` or a digit) collides with block syntax.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Fix both Markdown collisions in the parser now, during the spike | Out of scope for S1-T02; the spike's job was to prove the harness approach, not build the production parser (that's S2-T02). |

## Consequences

- The two collision hazards are currently worked around only in the
  *generator* (`ensureSafeParagraphStart`, line 131), which hides them from
  the property test rather than fixing them. S2-T02 must either make the
  real parser handle both cases correctly (preferred, since a real
  researcher's Markdown could trigger either) or make an explicit,
  documented product decision to disallow them, with the generator updated
  to test the chosen behaviour instead of avoiding it.
- Arbitraries currently cover only the four node types the S1-T01 spike
  implements (text, artefactRef, citation, paragraph/document). Coverage
  for headings, lists, code blocks, tables and other spec 5 constructs must
  be added alongside their parsers in Stage 2, before gate test S1-G01 (and
  its Stage 2 equivalents) can be considered representative.
- The commit message for 546cc3b claims local verification at 20,000 cases;
  only 200 is the committed, CI-enforced default via `FC_NUM_RUNS`. Treat
  20,000 as informal spike evidence, not a standing guarantee.
- `fast-check` is pinned with a caret range (`^4.10.0`) in the root
  `package.json`, not exact-pinned per-package; Stage 2 should confirm
  whether that matches the project's dependency-pinning expectations
  (AGENTS.md section 7.4) before this becomes load-bearing test
  infrastructure.
