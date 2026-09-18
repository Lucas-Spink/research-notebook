# ADR-0016: TanStack Table prototype confirms question-header, read-only, virtualised design

- Status: Proposed
- Date: 2026-09-18
- Deciders: maintainer
- Spec sections affected: 7.3

## Context

S1-T07 spiked the workspace table with 500 generated experiments, question
header rows, read-only rich summary cells and virtualisation, extending
ADR-0005 ("Use TanStack Table and TanStack Virtual. Question header rows
are rendered by the application. Cells show read-only summaries; one live
editor exists at a time.").

## Decision

Confirm ADR-0005's approach for the real workspace table (S2-T11). Evidence
in `apps/desktop/src/features/table-spike/`:

- 500 experiments across 20 questions are generated deterministically by a
  seeded mulberry32 PRNG (`model/generateExperiments.ts:33-42, 125-173`),
  with an `evenSplit` helper guaranteeing exact totals.
- Question header rows are real rows in the flattened table data
  (`buildTableRows.ts:26-53`: one header row plus N experiment rows per
  question, in order), not a rendering trick.
- Cells are plain `flexRender` output with no editable controls
  (`TableSpike.tsx:170-174`), confirming read-only cells.
- `useVirtualizer` (`TableSpike.tsx:86-94`) mounts only
  `virtualizer.getVirtualItems()`, with variable `estimateSize` per row
  type and `overscan: 10`.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Re-litigate AG Grid vs. TanStack here | Already decided in ADR-0005; this spike's job was to prove the chosen approach works at realistic scale, not reopen the choice. |

## Consequences

- Gate test S1-G08 ("no frame longer than 50ms" while scrolling 500 rows)
  has **no automated test anywhere in the repo**. The only evidence is a
  claim in the 079e513 commit message describing manual headless-Chromium
  profiling against the Vite dev server — not the real Tauri webview, and
  not measured on macOS. Before Stage 1 can be considered to have passed
  S1-G08, either a real profiling run against the packaged app on both
  platforms, or a committed automated frame-timing check, is needed.
- `@tanstack/react-table` (9.2.4) and `@tanstack/react-virtual` (3.14.13)
  are exact-pinned in `apps/desktop/package.json`.
