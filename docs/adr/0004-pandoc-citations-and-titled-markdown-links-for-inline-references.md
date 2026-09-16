# ADR-0004: Pandoc citations and titled Markdown links for inline references

- Status: Accepted
- Date: 2026-09-15
- Deciders: maintainer
- Spec sections affected: see specification chapter 15.1

## Context

Notes must remain meaningful in standard tools.

## Decision

Citations use Pandoc syntax with `z:` citekeys; artefact references are Markdown links whose title is `art:<ULID> v<N>`.

## Consequences

Notes render in VS Code, Obsidian and Pandoc. The editor needs custom parse and serialise rules for both nodes.
