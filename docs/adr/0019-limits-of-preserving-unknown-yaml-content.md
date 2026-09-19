# ADR-0019: Limits of preserving unknown YAML content

- Status: Proposed
- Date: 2026-09-19
- Deciders: maintainer
- Spec sections affected: 5.2, 5.5

## Context

S2-T03 requires unknown frontmatter keys to survive edits (spec 5.2, gate S2-G03). Two JavaScript behaviours, found by probing the `yaml` library in `packages/format` while planning the task, break that for values a user or another tool may legitimately write:

- **Key order.** A plain object lists integer-like keys (`"2"`, `"10"`) first, in ascending order, whatever the insertion order. An unknown key such as `"2"` was therefore written ahead of `id` in frontmatter and ahead of `format_version` in `project.yaml`, contradicting format-v1.md 3.3 ("unknown keys after all known keys").
- **Large integers.** `x_big: 12345678901234567890` is read as the double `12345678901234567000` and written back with those digits. The file changed silently on the next save, with no error.

The parse step (`doc.toJS()`) also loses the original relative order of unknown keys, because it produces plain objects.

## Decision

1. **YAML writers order through `Map`s.** `orderByShapeAsMaps` in `packages/format/src/key-order.ts` builds a `Map` for every shaped object, and `frontmatter.ts`, `project.ts` and `artefacts.ts` use it. A `Map` keeps insertion order for every key, so known keys stay first. `orderByShape` (plain objects) remains for JSON.
2. **Unsafe integers are rejected on read.** `readYaml` reports a syntax error for an integer literal, in decimal, `0x` or `0o` form, whose value is outside ±(2^53 − 1). The file opens read-only and is never rewritten (AGENTS.md section 2, rule 5). Quoted strings such as `"12345678901234567890"` and floats such as `1e300` are accepted, because they write back to the same value. The rule applies to every YAML value, known or unknown.

No `format_version` change is needed. Nothing the application writes contains such an integer (sizes and counts are far below 2^53), so every canonical file is unaffected. The rule only refuses files written by hand or by other tools that would otherwise have been changed.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Read integers with `intAsBigInt` | The model would hold `bigint` for some numbers and `number` for others, and every Zod number schema would have to accept both. |
| Accept the rounding and document it | Silent change to user data, against principle P4 and the purpose of gate S2-G03. |
| Parse to `Map`s throughout (`mapAsMap`) so the original order of unknown keys survives | Changes the model type of every unknown value and the schemas in `packages/format/src/schema/`. Disproportionate to the risk: it only matters for integer-like unknown keys. |
| Reject integer-like keys | Refuses valid YAML for a limitation of the reader, and needs a format rule the specification does not ask for. |

## Consequences

- **Residual limit, key order.** Among unknown keys of a shaped object, and inside any unknown value, integer-like keys are still written first in ascending order, before other unknown keys. They no longer precede the known keys. `request.json` and `bibliography.json` are written from plain objects, so their integer-like unknown keys still precede known keys; JSON is unchanged by this ADR.
- **Residual limit, JSON.** `JSON.parse` also rounds integers above 2^53 − 1. A portable check needs a tokeniser, because the source-text argument of a `JSON.parse` reviver is not available in every webview. Not done here; to be decided when `request.json` and `bibliography.json` gain unknown values worth protecting.
- `docs/format/format-v1.md` sections 3.3, 3.4 and 8 record both rules (rows 27 and 28).
- The `edge-cases` fixture (S2-T13) should include an unknown integer-like key. The `malformed` fixture should include an unsafe integer.
- Tests: `packages/format/src/preserve-unknown-values.test.ts`.
