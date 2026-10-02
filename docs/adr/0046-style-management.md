# ADR-0046: Citation style management

- Status: Proposed
- Date: 2026-10-02
- Deciders: maintainer
- Spec sections affected: 7.8 (FR-CIT-10, FR-CIT-11); gates S5-G02, S5-G08; follows up ADR-0045 point 7

## Context

S5-T06 lets a person choose the project's citation style. FR-CIT-11 asks for bundled in-text styles, import of `.csl` files, rejection of note styles with an explanation, and a copy of the active style in `styles/`. ADR-0045 left a fallback (the bundled numeric style) for a project whose `citation_style` file is not in `styles/`, and left the UI that triggers a style change to this task.

## Decision

1. **What is accepted.** `validateStyle` (in `packages/citations`, no I/O) accepts an independent CSL style whose root `<style>` element is in the CSL namespace, has `class="in-text"`, has a citation layout, has a title and id, is at most 1 MiB, and runs on a sample citation in citeproc-js. Only the root element is read for the class, so a `class="note"` in a comment or a later element changes nothing. It returns the text with LF line endings and no byte order mark (`.gitattributes` makes `styles/*.csl` LF).
2. **What is refused, and why the person is told.** `class="note"` (footnote styles need note positions the notebook does not have); dependent styles (`rel="independent-parent"`, the parent cannot be fetched offline); non-CSL text; a missing citation layout; a style citeproc-js cannot run; a file over 1 MiB. Each has its own message in `messages.ts`.
3. **Bundled styles.** The two written for this project (numeric and author-date, ADR-0045) are the whole set for now. They are copied to `styles/numeric.csl` and `styles/author-date.csl`. Styles from the CSL repository are CC BY-SA and are not bundled.
4. **Import.** The webview reads a file the person picks through a plain file input; there is no Rust command or capability for it. The file name is made safe by `styleFileName` (lower-case letters, digits and hyphens, at most 64 characters, `.csl`).
5. **Never overwrite.** A style is created in `styles/` with the "absent" expectation. If a file of that name exists with the same content (after LF and BOM normalisation) it is adopted without copying. If it differs, the choice is refused (`nameTaken`) and the person is asked to rename it. If `styles/` cannot be read, nothing changes.
6. **One plan.** `changeCitationStyle` (`packages/format`) returns one ordered plan: the style file (if copied), each experiment's regenerated Literature block, then `project.yaml` once, last (ADR-0026). A stop part way never leaves `project.yaml` naming a style that is not in `styles/`. Section text is never in the plan. Choosing the style already named regenerates the blocks and leaves `project.yaml` alone unless its writer stamp moves.
7. **Hand-edited blocks are kept.** Regeneration uses `planRegeneration` with the style the blocks were generated under (ADR-0045 point 1). A block that differs from that render is not replaced; the person is told how many were kept. Re-choosing the current style does not regenerate them either.
8. **No format change.** `citation_style` already exists and is validated as a `.csl` file name.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Parse the style with an XML library | A new dependency for a root-element check; citeproc-js itself is the final judge of whether a style runs. |
| Overwrite a same-named file after confirmation | A style file is part of how the record is rendered; replacing one silently or by a quick click risks changing every Literature block. Renaming is cheap. |
| Replace hand-edited blocks on a style change | Spec 5.5 rule 6 says edited blocks are not replaced without asking, and a style change is not an invitation to discard edits. |
| A Rust dialog command for import | More code and a new command for something the webview's file input does without file-system access. |
| List every file in `styles/` in the picker | `list_notebook_files` returns data files only; a listing command is out of scope. A previously imported style is chosen again by importing it; an identical file is adopted. |

## Consequences

- **Tests.** `style-validation.test.ts` and its property test (S5-G08), `citation-style.test.ts` in `packages/format`, `styleManagement.test.ts` and `StylePicker.test.tsx` in the desktop app, a `snapshot.rs` test and a `fs_safety.rs` step in `nb-fs` (protected path, tests only).
- **Locale.** Styles render with the bundled `en-US` locale; the project locale setting is FR-PRJ-08 and not part of this task.
- **Limits.** The style picker lists the bundled styles and the current style only. The interrupted-plan case (a stop after some blocks were written) leaves blocks in the new style under the old name until the style is chosen again; choosing it again regenerates them.
- **Not measured.** Regenerating a large project's blocks renders each experiment once in the worker; no timing was taken.
