# ADR-0009: Reference machine for performance thresholds

- Status: Proposed
- Date: 2026-09-18
- Deciders: maintainer
- Spec sections affected: 10.1

## Context

Spec section 10.1 sets nine NFR-PERF thresholds "measured on a reference
machine defined in Stage 1 (suggested: four-core laptop, 16 GB memory, SSD)"
and allows Stage 1 to recalibrate them through an ADR.

No reference machine has been recorded yet. In practice, the automated
NFR-PERF gate tests (`pnpm bench`, run nightly per spec 10.1's "measured by"
column) execute on GitHub Actions hosted runners, not on a dedicated bench
machine. Those runners differ substantially by platform: the standard
`windows-latest` runner for public repositories is 4 vCPU, 16 GB RAM and
14 GB SSD, matching the spec's suggested baseline closely, but the standard
`macos-latest` (ARM64) runner is only 3 vCPU, 7 GB RAM and 14 GB SSD, well
below it. A reference machine defined purely as "the CI runners" would
therefore mean two different, GitHub-controlled hardware baselines per
platform, with the macOS one materially weaker than what the spec intends
to represent.

## Decision

Two things are recorded:

1. **Primary reference machine** (the baseline spec 10.1 calls for, used for
   local/manual benchmarking and for judging whether a threshold is
   realistic): the maintainer's development laptop —
   Intel Core i7-11370H, 4 cores / 8 threads @ 3.30 GHz, 31.8 GB RAM, NVMe
   SSD, running Windows 11 Home 64-bit. This meets or exceeds the spec's
   suggested four-core / 16 GB / SSD baseline, so no NFR-PERF threshold in
   spec 10.1 is recalibrated by this ADR.

2. **Automated nightly benchmark environment** (where `pnpm bench` and the
   other automated NFR-PERF gate tests actually run): GitHub Actions
   standard hosted runners for public repositories, as documented by GitHub
   in September 2026 —
   - `windows-latest`: 4 vCPU, 16 GB RAM, 14 GB SSD.
   - `macos-latest` (ARM64): 3 vCPU, 7 GB RAM, 14 GB SSD.

   Because the hosted macOS runner falls meaningfully short of the primary
   reference machine, NFR-PERF results recorded on `macos-latest` are
   **advisory, not gating**, until a physical Mac meeting or exceeding the
   spec 10.1 baseline is added as a second primary reference machine and
   this ADR is amended. Results on `windows-latest` are treated as gating,
   since that runner already matches the primary reference machine's
   profile.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Define the reference machine purely as the GitHub-hosted CI runners | The macOS runner (3 vCPU / 7 GB) is well below the spec's intended baseline and would silently under-represent real user hardware; runner specs are also outside our control and can change without notice. |
| Provision a dedicated benchmark VM matching the spec's exact suggested profile | No such machine is currently available, and the maintainer's existing laptop already meets the suggested profile, so the added infrastructure is not justified yet. |

## Consequences

- NFR-PERF thresholds in spec 10.1 are unchanged; this ADR calibrates the
  reference machine to the existing thresholds rather than the reverse.
- Nightly `pnpm bench` results on `windows-latest` gate Stage 7 performance
  sign-off (S7-G08); results on `macos-latest` are reported but do not gate
  it until a macOS reference machine is added.
- When a physical Mac reference machine becomes available, amend this ADR
  (do not open a new one) to add it as a primary reference machine and
  promote macOS NFR-PERF results to gating.
- `docs/spec/specification.md` 10.1 should gain a cross-reference to this
  ADR; that edit is proposed separately for maintainer approval per S1-T11,
  not made here.
