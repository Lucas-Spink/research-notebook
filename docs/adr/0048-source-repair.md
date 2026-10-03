# ADR-0048: Source repair

- Status: Proposed
- Date: 2026-10-03
- Deciders: maintainer
- Spec sections affected: 5.7, 5.9, 7.8 (FR-CIT-08); gate S5-G06; S5-G01 and S5-G04 (must still hold)

## Context

S5-T08 lets a person replace a missing or trashed source with another Zotero item, so every citation of the old source points at the new one (FR-CIT-08). Questions that were open:

- Replacement touches every experiment that cites the old source, so it is several `experiment.md` writes, and a set of writes is not atomic.
- Spec 5.9 says uncited items leave `bibliography.json` only through the archive step or an explicit clean-up.
- Citations must change and nothing else in the text may, including hand-written forms (spec 5.7).
- Each affected experiment's Literature block depends on the cited sources.

## Decision

1. **No format change.** Nothing new is stored. The citekey is already the source's identity in text, and `bibliography.json` already holds the old and new entries.
2. **One rewrite function in `packages/format`.** `replaceCitekey(text, from, to)` swaps only the citekey span of each citation of `from`. Prefix, locator, suffix, the suppress-author `-`, spacing and hand-written author-in-text forms are kept byte for byte. Code fences and inline code are skipped, as the editor does not treat them as citations. It reuses the section editor's own patterns and the `Citekey` check, so there is still one parser (AGENTS.md rule 2). A property test asserts that what the parser reads after the rewrite is exactly what it read before, with `from` changed to `to`.
3. **One plan, ordered.** `replaceSource(state, { from, to, literature? }, env)` in `packages/format/src/notebook` rewrites every recognised section of every experiment that cites `from`, using `editExperimentSection` so the text and the regenerated block are one write per experiment. It returns one `Plan`: each experiment once, `project.yaml` last and only if its writer stamp moved, like `changeCitationStyle` (ADR-0026). Experiments that do not cite `from` are not written. Unknown sections and the preamble are left as they are.
4. **Partial failure is recoverable, not rolled back.** The plan runs through the existing step runner with its sha256 guards. If a write fails part-way, experiments already written stay rewritten and the rest are untouched, and the status says so. Running the same replacement again finishes the job, because a rewrite of already-rewritten text changes nothing (tested). A journal or all-or-nothing scheme was judged more machinery than the failure case deserves.
5. **Order in the app (`repairSource`).** Check the source is missing or trashed and some experiment cites it; fetch the replacement into `bibliography.json` through `syncSources`; require it to be `ok` (in Zotero, not trashed, no server mismatch); compute each changed experiment's block; apply the plan. Nothing is written before the checks pass. A replacement that turns out to be trashed or missing has already been added to `bibliography.json` by the fetch; the entry is harmless and carries its state.
6. **The old entry is kept**, still marked missing or trashed, so undo and `pandoc` on an older copy lose nothing (spec 5.9).
7. **Literature blocks.** Blocks are regenerated for the new text and bibliography. The comparison that detects a hand-edited block renders the stored text under the old bibliography (`planAfterTextChange`), so the changed bibliography alone does not read as an edit. A block that was edited by hand is left as it was and the status line says how many; unlike a section save, this action does not stop to ask, because the text change has no other way to be undone and asking per experiment would be a long dialogue. The block can be regenerated later from a normal save.
8. **The picker is reused** in a `replace` mode: exactly one source, no locator, prefix or suffix, and the source being replaced is left out of the results. It searches the user library only, so a group-library replacement cannot be chosen yet (as ADR for S5-T02).
9. **Where the button is.** Replace appears beside each missing or trashed source in the Sources list, in a writable project. With Zotero closed the picker shows its existing offline state and `repairSource` reports it; nothing is changed.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Rewrite through the parsed document (parse, edit nodes, serialise) | The serialiser may normalise text elsewhere in the section; the task requires the rest of the text to be unchanged. |
| Remove the old entry from `bibliography.json` | Spec 5.9 reserves removal for archive or explicit clean-up. |
| A journal to make several writes atomic | Large for a rare action that is safe to repeat. |
| Prompt per experiment for hand-edited blocks | Many prompts for one action; leaving them as they are loses nothing. |
| Offer Replace for sources that are still `ok` | Not in FR-CIT-08; a live source needs no repair. |

## Consequences

- **Tests:** `editor/citekeyRewrite{,.property}.test.ts`, `notebook/source-repair.test.ts`, `model/source-repair.test.ts` (S5-G06), `source-repair-ui.test.tsx`, replace-mode cases in `CitationPicker.test.tsx`. No change to `fs_safety.rs`: every write is an existing guarded `_notebook/` write.
- **A hand edit inside a code fence in a list** that the editor would treat as a citation is the one place the fence rule could disagree with the parser; the property test covers fences and inline code but not indented fences inside lists.
- **Not tested:** against a real Zotero, in a real window, or on macOS.
- **Protected paths:** this ADR (`docs/adr/`) only.
