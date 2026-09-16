# ADR-0005: TanStack Table with read-only cells

- Status: Accepted
- Date: 2026-09-15
- Deciders: maintainer
- Spec sections affected: see specification chapter 15.1

## Context

AG Grid Community row spanning depends on adjacency and row grouping is an Enterprise feature; rich editors inside virtualised grid cells conflict with keyboard handling and row measurement.

## Decision

Use TanStack Table and TanStack Virtual. Question header rows are rendered by the application. Cells show read-only summaries; one live editor exists at a time in the expanded view.

## Consequences

More custom rendering code; simpler editing and accessibility.
