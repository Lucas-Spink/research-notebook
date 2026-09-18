# ADR-0012: citeproc-js worker message protocol

- Status: Proposed
- Date: 2026-09-18
- Deciders: maintainer
- Spec sections affected: 7.8

## Context

S1-T03 spiked whether citeproc-js can run behind a Web Worker message
protocol and correctly number citations for numeric and author-date styles
after inserts and deletions.

## Decision

Adopt the pure message-reducer design for the production worker protocol in
Stage 5 (S5-T05). Evidence:

- `packages/citations/src/spikes/citeproc-engine.ts:108-147` implements
  `handleMessage(state, request)` for `init`/`cite`/`bibliography` request
  types, wrapping citeproc-js's `CSL.Engine`, `processCitationCluster` and
  `makeBibliography` as a pure function — no I/O, matching the
  `.dependency-cruiser.cjs:28` rule that packages/format and
  packages/citations perform no I/O.
- `packages/citations/src/spikes/citeproc-worker-entry.ts:29-33` wraps the
  reducer in `self.onmessage`/`postMessage`, so the actual Worker wiring
  exists in source.
- `citeproc-engine.test.ts` has 4 passing tests covering numeric-style
  numbering and mid-insert renumbering, numeric-style deletion
  renumbering, author-date insert (no renumbering) and author-date
  deletion — directly satisfying the spike's stated definition of done.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Test the Worker boundary itself in this spike | jsdom (the test environment) has no `Worker` API, and Node's `worker_threads.Worker` uses a different message API; the file's own header comment (lines 9-18) defers this to when the code runs inside the real Tauri webview. |

## Consequences

- The `postMessage`/`onmessage` wiring in `citeproc-worker-entry.ts` is
  **not exercised by any test** — only the pure reducer is tested. Stage 5
  (S5-T05) must add a test that runs inside a real worker/webview context
  before relying on this boundary in production.
- Gate test S1-G03 ("citation numbering property", `pnpm test:property --
  citation-context`, random insert/delete/move sequences) is **not yet
  implemented** — this spike only delivered example-based unit tests, not
  the property test. S1-G09 (spike review) should treat S1-G03 as open
  work, not as passed by this spike.
- `citeproc` is exact-pinned at 2.4.63 in `packages/citations/package.json`,
  with a hand-written `.d.ts` since citeproc ships no types; already
  licence-checked (ADR-0006).
