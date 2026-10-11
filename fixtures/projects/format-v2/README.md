# format-v2 fixtures

Format version 2 (ADR-0064) adds canvas files. Once merged, these folders are
immutable (AGENTS.md section 6): add a new fixture for a new case rather than
editing one here.

The version 1 fixtures in `../format-v1/` stay as they were released. The
harness (`fixtures/support.ts`) migrates a **temporary copy** of any older
fixture with `packages/format`'s own migration before opening it, which is what
the application does when a person updates an older project, so the committed
folders are never read as version 2 nor written to.

| Fixture | How it was made | What it is for |
| --- | --- | --- |
| `canvases` | `scripts/generate-canvas-fixture.mjs`, with the application's own serialisers | Two questions of two experiments, copy-mode and link-mode artefacts, and two canvases: one pins results from both questions and holds a note, a region, labelled and unlabelled connectors and one deliberately missing reference; one is empty |
| `future-format-v3` | Hand-written | A `project.yaml` with `format_version: 3`, for the whole-project read-only case (S2-G10), now that version 2 is current |
| `large` | `pnpm fixtures:generate`, 500 experiments and 5,000 artefacts | Performance (S2-G14); **not committed**, generated on demand |

`canvases` is canonical, so `serialise(parse(file))` is byte for byte the same
file for every file in it, canvases included.
