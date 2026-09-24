import StarterKit from "@tiptap/starter-kit";
import { Passthrough } from "./passthrough";

/**
 * The schema for a section editor (Methods, Results Notes, Interpretation):
 * FR-EDT-01's supported nodes and marks, plus the passthrough block
 * (FR-EDT-02). Shared by `packages/format`'s parse/serialise functions and
 * `apps/desktop`'s live editor, so both always agree on what the syntax
 * means (AGENTS.md 2.2, one parser).
 *
 * `apps/desktop` may extend the result (for example to attach a NodeView to
 * `Passthrough`) but must not redefine or reorder the nodes themselves.
 */
export function sectionEditorExtensions() {
  return [
    StarterKit.configure({
      // Not in FR-EDT-01: never authored by this editor. A hand-written
      // strikethrough, underline or thematic break is kept as read-only
      // passthrough instead (see ./passthrough.ts).
      strike: false,
      underline: false,
      horizontalRule: false,
      hardBreak: false,
      heading: { levels: [3, 4] },
      link: { openOnClick: false },
    }),
    Passthrough,
  ];
}
