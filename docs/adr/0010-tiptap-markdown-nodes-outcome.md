# ADR-0010: Tiptap MarkdownManager round-trips artefactRef and citation nodes

- Status: Proposed
- Date: 2026-09-18
- Deciders: maintainer
- Spec sections affected: 5.6, 5.7

## Context

S1-T01 spiked whether custom Tiptap nodes for artefact references and
citations can parse from and serialise to the Markdown syntax in spec 5.6
and 5.7, using `@tiptap/markdown`'s `MarkdownManager` built outside a full
editor/DOM instance (`packages/format/src/spikes/tiptap-markdown-nodes.ts`).
This is a precondition for ADR-0002 (packages/format is the only parser) and
ADR-0004 (Pandoc citation syntax and `art:`-titled links).

## Decision

Adopt this approach for packages/format's real parser in S2-T02. Evidence:

- `ArtefactRef` (lines 75-116) and `Citation` (lines 183-224) nodes each
  register a `markdownTokenizer`/`parseMarkdown`/`renderMarkdown` on a bare
  `MarkdownManager` (line 226) built from minimal `Document`/`Paragraph`/
  `Text` nodes (lines 22-43) — no Editor or DOM instance, confirming the
  spike can run headless inside `packages/format` per the architecture
  boundary (packages/format does not import Tauri or React).
- `packages/format/src/spikes/tiptap-markdown-nodes.test.ts` round-trips
  every spec 5.6 example (copy mode with version, link mode) and every spec
  5.7 example (single citekey, multi-citekey with prefix/locator/
  suppress-author) byte-for-byte, plus mixed-prose cases. All 20 tests in
  the package pass.
- Implementation syntax is identical to the spec 5.6/5.7 examples
  (`docs/spec/specification.md:409-476`); no mismatch found on tested
  constructs.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Full Tiptap `Editor` instance for parse/serialise in packages/format | Would pull React/DOM dependencies into a package that must do no I/O and stay UI-framework-free; the bare `MarkdownManager` proves this isn't necessary. |

## Consequences

- Two constructs are not yet covered by any test and must gain coverage in
  S2-T02: the bare (unbracketed) `@citekey` "author-in-text" form from spec
  5.7, and spec 5.6's rule that a link whose title doesn't start with `art:`
  is an ordinary link, not an artefact reference. The spike's tokenizers
  only matched the bracketed forms exercised in its tests.
- The spike's ULID regex accepts the full `[0-9A-Z]{26}` alphabet rather
  than excluding Crockford's I/L/O/U; the real implementation needs a
  shared ULID validator (flagged in a code comment at
  `tiptap-markdown-nodes.ts:57-60`).
- `@tiptap/core`, `@tiptap/markdown` and `@tiptap/pm` are exact-pinned at
  3.31.3 in `packages/format/package.json`; version bumps need the
  round-trip tests re-run before upgrading.
