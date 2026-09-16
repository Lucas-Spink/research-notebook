# ADR-0003: Evidence captured as immutable versions

- Status: Accepted
- Date: 2026-09-15
- Deciders: maintainer
- Spec sections affected: see specification chapter 15.1

## Context

Pipelines overwrite outputs under the same filename, which would silently change the evidence behind an interpretation.

## Decision

Files at or below a size threshold are copied into the experiment folder as numbered immutable versions; larger files are linked with checksums. References pin a version.

## Consequences

Extra storage; evidence folders excluded from git by default; version update UI required.
