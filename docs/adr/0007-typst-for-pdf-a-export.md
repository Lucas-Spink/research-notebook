# ADR-0007: Typst for PDF/A export

- Status: Accepted
- Date: 2026-09-15
- Deciders: maintainer
- Spec sections affected: see specification chapter 15.1

## Context

Archived records need a fixed, validated format including PDF figures.

## Decision

Embed Typst as a pinned Rust library. A fixed template reads JSON data; user text is never concatenated into Typst markup.

## Consequences

Typst's 0.x API may change between releases; version upgrades require export golden tests and veraPDF validation.
