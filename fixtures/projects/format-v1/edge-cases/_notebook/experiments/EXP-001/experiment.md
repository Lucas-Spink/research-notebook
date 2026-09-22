---
id: "01JAX000000000000000000104"
ref: "EXP-001"
question: "01JAX000000000000000000102"
title: "An experiment with a byte-order mark, unknown content and passthrough Markdown"
status: "running"
started: "2026-01-05"
created: "2026-01-06T09:00:03Z"
updated: "2026-01-06T09:00:03Z"
x_imported_from: "a tool that writes BOM and unknown keys"
---

A short preamble before any heading, preserved as written.

## Methods

PCA on normalised counts [DESeq2](https://example.org "art:01JAX000000000000000000999").
The link above points to a ULID that names no artefact in this experiment's
`artefacts.yaml`: a detached reference (spec 5.6), preserved and shown as
detached rather than rejected.

## Notes

An unknown level-2 heading (format-v1.md 4.3 rule 3): not `Methods`, `Results
notes` or `Interpretation`, so it is carried through unchanged, including the
passthrough content below that this format does not otherwise understand.

| Run | Batch | PC1    |
| --- | ----- | ------ |
| 1   | A     | 12.4   |
| 2   | B     | -8.1   |

<div class="note">Raw HTML preserved as passthrough (FR-EDT-02).</div>

## Results notes

## Interpretation

Formatting-looking text such as `not_code()`, **not bold**, and a [normal
link](https://example.org) that is not an artefact reference because its
title does not start with `art:` (format-v1.md 7.1).

<!-- literature:start -->
## Literature

1. Love, M. I., Huber, W. & Anders, S. Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2. Genome Biol. 15, 550 (2014).
<!-- literature:end -->
