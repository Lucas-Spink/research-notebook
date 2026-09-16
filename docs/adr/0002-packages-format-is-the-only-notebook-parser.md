# ADR-0002: packages/format is the only notebook parser

- Status: Accepted
- Date: 2026-09-15
- Deciders: maintainer
- Spec sections affected: see specification chapter 15.1

## Context

The desktop app, VS Code extension and exporters all read notebook files. Separate parsers would drift and corrupt files.

## Decision

All parsing, serialising, validation and migration of notebook files lives in `packages/format` (TypeScript). Rust handles bytes, hashing and I/O only.

## Consequences

Rust cannot interpret notebook semantics directly; exports receive JSON produced by the format library.
