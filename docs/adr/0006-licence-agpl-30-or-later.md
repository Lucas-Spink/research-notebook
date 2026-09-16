# ADR-0006: Licence AGPL-3.0-or-later

- Status: Accepted
- Date: 2026-09-15
- Deciders: maintainer
- Spec sections affected: see specification chapter 15.1

## Context

citeproc-js is available under AGPL; the project is fully open source.

## Decision

License the project AGPL-3.0-or-later. Allow only compatible dependency licences. citeproc is excluded from the automated npm licence string check because its licence field lists CPAL-1.0 OR AGPL; its AGPL option is used.

## Consequences

All distributed modifications must be released under the same licence.
