# ADR-0008: Separate stable and development builds

- Status: Accepted
- Date: 2026-09-15
- Deciders: maintainer
- Spec sections affected: see specification chapter 15.1

## Context

The maintainer develops the application and uses it for real research; a broken development build must not damage real projects.

## Decision

Development builds use a different application identifier and settings directory and open projects read-only unless they are marked as test copies.

## Consequences

Two installations on the maintainer's machine; an "Open a copy for testing" action is required.
