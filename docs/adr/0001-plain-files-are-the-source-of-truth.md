# ADR-0001: Plain files are the source of truth

- Status: Accepted
- Date: 2026-09-15
- Deciders: maintainer
- Spec sections affected: see specification chapter 15.1

## Context

Research content must survive application bugs, breaking releases and abandonment, and must be readable on another computer without the application.

## Decision

All research content lives in Markdown, YAML and CSL-JSON files under `_notebook/`. SQLite is a disposable index in the application cache directory.

## Consequences

Deleting the index loses nothing. Queries need an index rebuild step. Every write path must go through the format library and atomic writes.
