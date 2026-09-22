# format-v1 fixtures

Once merged, these folders are immutable (AGENTS.md section 6): add a new
fixture for a new case rather than editing one here.

| Fixture | How it was made | What it is for |
| --- | --- | --- |
| `minimal` | `scripts/lib/build-notebook.ts`, one question and one experiment | The smallest valid project |
| `typical` | The same builder, 3 questions and 12 experiments (spec 12.3) | A realistic small project |
| `large` | `pnpm fixtures:generate` (`scripts/generate-large-fixture.mjs`), 500 experiments and 5,000 artefacts | Performance (S2-G14); **not committed**, generated on demand |
| `edge-cases` | Hand-written | Unicode names, a CRLF file, a byte-order mark, unknown keys, passthrough Markdown, a detached artefact reference, a trashed bibliography source (spec 12.3) |
| `malformed` | Hand-written | One valid question alongside files that each fail to parse in one documented way — a missing frontmatter fence, a disallowed status, a duplicated key, a repeated heading (S2-G04) |
| `future-format` | Hand-written | A `project.yaml` with `format_version: 2`, for the whole-project read-only case (S2-G10) |

`minimal`, `typical` and `large` are generated with the application's own
serialisers, so they are canonical: `serialise(parse(file))` is byte for
byte the same file (format-v1.md 3.2). `edge-cases` deliberately is not.
Each fixture folder carries a `fixture.json` saying so:

```json
{ "kind": "edge-cases", "canonical": false }
```

`fixtures/canonical.fixtures.test.ts`, `fixtures/edge-cases.fixtures.test.ts`
and `fixtures/malformed.fixtures.test.ts` read this to decide which check
applies. `fixture.json` is read only by that harness; it is never inside
`_notebook/`, so `packages/format` never sees it (AGENTS.md rule 2).

Fixtures are copied to a temporary directory before being opened
(`fixtures/support.ts`); the folders here are never read by application code
directly, only by this harness (docs/testing-guide.md).
