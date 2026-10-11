# ADR-0065: A canvas for each question, with notes and lines

- Status: Accepted
- Date: 2026-10-12
- Deciders: maintainer
- Spec sections affected: 5.14, 7.13 (FR-CNV-02 to FR-CNV-06). Amends ADR-0064 points 1, 2 and 8 (which canvases there are, and what the writing beside the canvas is). No change to the file format: no new key, no new version.

## Context

ADR-0064 gave a project any number of named, project-wide canvases, and put the table's three experiment editors (Methods, Results Notes, Interpretation) in a panel beside the canvas. In use that was confusing: two places to write the same text, behind two rows of tabs, and a results list that was hard to scan for figures.

The maintainer's intent is that **the canvas is for drafting ideas and the table is the final record**. The canvas should hold short notes written beside the figures they are about, joined to those figures by lines, and each question's notes and the figures they refer to should be readable in one place, in the canvas and in the table view.

## Decision

1. **One canvas for each question.** A question's canvas is `_notebook/canvases/<QUESTION_ULID>.canvas.json`, and its `id` is the question's ULID. The existing rule that a canvas file is named by its `id` (format-v1.md 4.9) then gives one canvas per question by construction, with no picker. The file is made by the first change to it (a pinned figure, a note, a line), written as a file that must not exist yet; until then the canvas shown is an empty one in memory. A question restored from the bin finds its canvas again, because the id is the question's. A canvas with another id is left on disk untouched and is not shown.
2. **Notes are cards on the canvas.** A note is a `note` node (already part of format version 2): plain text, written in place, movable and resizable. The text is plain so that a note never takes the application's one live editor (ADR-0043) and needs no citation or reference index. Notes are the canvas's own; they are not a section of any experiment.
3. **A line is a reference.** A line (an `edges` entry, with no label for now) joins a note to a figure card or to another note. A figure is never joined to a figure, a card is not joined to itself, and a pair is joined once, whichever way round it was drawn. A note is always the line's source. A line from a note to a figure is the note's reference to that figure; it is the whole reference, and nothing is written into the note's text. Removing the line removes the reference; removing a card removes its lines.
4. **A summary, never stored.** For a question, the summary lists each note, in the order it reads down the canvas, with the figures its lines join it to (name, experiment, version, or "no longer available") and the notes it is linked to. It is worked out from the canvas each time and stored nowhere, so it cannot disagree with the lines. It is shown beside the canvas and, read-only, in a pane of the table view.
5. **The experiment editors leave the canvas.** Experiment text is edited in the table only. The canvas has no writing panel.
6. **Results beside the canvas are the whole project's**, grouped by question with the question being worked on first, each result with a thumbnail. A figure from another question can be pinned to this question's canvas to compare.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Keep several named canvases per project | The maintainer wants a canvas for each question; a picker and create, rename and delete add work that a question already answers. |
| One running draft document per canvas | Not tied to places on the canvas, and the maintainer wants notes beside the figures they are about. |
| Write the reference into the note's text when a line is drawn | The text and the lines could then disagree. |
| Formatted notes with the table's editor | Competes for the single live editor and would need citation and reference indexing for a draft. Can come later. |
| A `question_id` key in the canvas file | Redundant with the id, and a second place for the link to go wrong. |
| Keep experiment editing in the canvas | Two places to write the same text was the confusion this decision removes. |

## Consequences

- The picker, rename and delete of canvases, and their store functions and tests, are removed. A question's canvas cannot be deleted from the interface; emptying it is removing its cards.
- Canvases made under ADR-0064 with random ids are no longer shown; their files are untouched and can be deleted by hand.
- The summary is a pure function of one canvas file and the notebook, and is tested as such.
- Documents to change: spec 7.13 and 5.14, format-v1.md 4.9 (canvas id convention), ADR-0064 (amended).
