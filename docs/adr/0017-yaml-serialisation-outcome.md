# ADR-0017: YAML serialisation key order, quoting and unknown-key preservation

- Status: Proposed
- Date: 2026-09-18
- Deciders: maintainer
- Spec sections affected: 5.2

## Context

S1-T08 spiked whether the `yaml` library can write double-quoted strings in
the key order documented in spec 5.3, while preserving unknown keys, ahead
of the real serialiser in S2-T02.

## Decision

Adopt the `yaml` library's `stringifyYaml` with explicit key reordering for
the production serialiser. Evidence in
`packages/format/src/spikes/yaml-serialisation.ts`:

- `serialiseProjectYaml` (line 68) calls `stringifyYaml(ordered, {
  defaultStringType: "QUOTE_DOUBLE", defaultKeyType: "PLAIN" })`.
- `orderProjectYamlFields`/`orderKeys` (lines 41-66) enforce
  `PROJECT_YAML_KEY_ORDER` (lines 11-25) and nested orders for
  `capture`/`numbering`/`table` (lines 27-31), matching spec 5.3's
  documented order exactly (`docs/spec/specification.md:290-305`).
- Unknown keys fall through to the end of `orderKeys`'s output (lines
  49-51) in their original relative order.
- `yaml-serialisation.test.ts` proves all of the above, plus a full
  `parse(serialise(x))` round-trip including an unknown key; all tests
  pass.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Hand-written YAML writer | The `yaml` library already supports both the quoting style and key-order control needed; a hand-written writer would duplicate well-tested behaviour for no benefit. |

## Consequences

- No open items — all three stated criteria (double-quoted strings,
  documented key order, unknown-key preservation) are directly verified by
  passing tests, with no deviation from spec 5.3 found.
- `yaml` is exact-pinned at 2.9.1 in `packages/format/package.json`.
