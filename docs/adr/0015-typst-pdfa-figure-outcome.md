# ADR-0015: Typst PDF/A export embeds figures as SVG, not PDF

- Status: Proposed
- Date: 2026-09-18
- Deciders: maintainer
- Spec sections affected: 7.12

## Context

S1-T06 spiked embedded Typst rendering one experiment's JSON, including a
figure, to PDF/A-2b, with user text passed only as data — extending ADR-0007
("Embed Typst as a pinned Rust library. A fixed template reads JSON data;
user text is never concatenated into Typst markup"). The workbook's DoD
text for S1-T06 names "a PDF figure"; the spike could not deliver that
literally. `specification.md` itself does not mandate a figure format
anywhere (checked directly — no match for "PDF figure"; FR-ARC-06 only
requires notebook.json/bibliography.json embedding), so this is a workbook
wording issue, not a specification.md conflict.

## Decision

Embed the figure as SVG, not PDF. Evidence, in
`apps/desktop/src-tauri/crates/nb-export/src/lib.rs`:

- `TemplateWorld::file()` (lines 136-144) serves exactly three virtual
  files to the Typst compiler: the fixed committed `template.typ` source,
  `/data.json` and `/figure.svg` — never a PDF as a figure input.
- This is a forced choice, not a preference: `typst-pdf` 0.15.1's
  krilla-based PDF/A validator raises `ValidationError::EmbeddedPDF` if a
  raw PDF is embedded as an image under a PDF/A standard (documented in a
  code comment at `lib.rs:16-23` and the 3a84d7b commit message).
- The user-text-as-data invariant is proven, not just asserted: injection
  tests in `tests/injection.rs` feed six payloads (`#read(...)`, `$1+1$`,
  `#{1+1}`, a malicious `#import`, etc.) through `notes` and assert the
  literal string appears in the rendered output rather than being
  interpreted as Typst markup, plus a `#pagebreak()` payload that must not
  change page count. This satisfies gate test S1-G07.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Convert supplied PDF figures to PDF, embed directly | Rejected by typst-pdf/krilla's own PDF/A validator; not a workaround available to us without abandoning PDF/A-2b conformance. |
| Rasterise the figure to PNG/JPEG instead of SVG | SVG preserves vector quality for plots/diagrams, which PNG/JPEG would degrade; no technical blocker found for SVG. |

## Consequences

- The workbook's S1-T06 DoD text ("a PDF figure") needs a maintainer-applied
  correction to "a vector (SVG) figure" in both the xlsx and
  `docs/planning/stages.md`, in the same PR as this ADR's approval, per the
  workbook's own rule that gate/task wording changes update both files
  together.
- PDF/A-2b conformance for this spike's actual output has **not** been
  verified by veraPDF. `tests/pdfa.rs:33-37` only asserts the output starts
  with `%PDF-1.7` and exceeds 1000 bytes, with a comment stating real
  conformance checking is deferred to the nightly veraPDF step. I checked
  that nightly job (`.github/workflows/nightly.yml:106-120`) directly: it
  targets PDF/A flavour **3b**, not 2b, against
  `fixtures/projects/format-v1/typical`, a fixture that does not exist
  until S2-T13. So gate test S1-G06 has not actually been exercised against
  this spike's output at all — it is open work, not pending-nightly work.
- Pinned versions in `nb-export/Cargo.toml`: `typst`, `typst-pdf`,
  `typst-layout`, `typst-kit` all exact-pinned at `=0.15.1`, embedded-fonts
  only (no network/system font access).
