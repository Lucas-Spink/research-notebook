import { buildArtefactRefNode } from "@research-notebook/format";
import {
  Extension,
  ReactRenderer,
  type AnyExtension,
  type JSONContent,
  type Range,
} from "@tiptap/react";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import {
  ArtefactAutocomplete,
  type ArtefactAutocompleteProps,
} from "./ArtefactAutocomplete";
import type { ArtefactSearchRow } from "./model/artefactSearch";
import { allowsArtefactTrigger } from "./model/trigger";

const EXTENSION_NAME = "artefactSuggestion";
const LIST_ID = "artefact-autocomplete-list";

type Options = {
  /** The experiment's copy-mode artefacts matching `query` (FR-EDT-04). */
  search: (query: string) => ArtefactSearchRow[];
};

/** Just enough of Tiptap's chainable commands to insert one node (kept
 * narrow so a test can supply a plain fake instead of a real `Editor`). */
type Chainable = {
  focus: () => Chainable;
  insertContentAt: (range: Range, content: JSONContent) => Chainable;
  run: () => boolean;
};
export type InsertableEditor = { chain: () => Chainable };

/** Inserts `row`'s reference, pinned to its latest version (FR-EDT-05). */
export function insertArtefactReference(
  editor: InsertableEditor,
  range: Range,
  row: ArtefactSearchRow,
): void {
  editor
    .chain()
    .focus()
    .insertContentAt(
      range,
      buildArtefactRefNode({
        ulid: row.id,
        version: row.version,
        label: row.label,
        target: row.target,
      }),
    )
    .run();
}

/** What `artefactSuggestionRenderer()` returns: `@tiptap/suggestion`'s `render` shape. */
export type SuggestionRenderer = ReturnType<typeof artefactSuggestionRenderer>;

/**
 * The @ autocomplete's popup lifecycle: mounts `ArtefactAutocomplete` via
 * Floating UI (`props.mount`, @tiptap/suggestion 3.31's managed
 * positioning — no separate positioning library needed), moves the
 * keyboard-highlighted row on Up/Down, and calls `props.command` (which
 * `artefactSuggestion` below wires to `insertArtefactReference`) on Enter
 * or a click. Escape is handled by `@tiptap/suggestion` itself (it calls
 * this render's `onKeyDown` and then always exits), so it is not handled
 * again here. A plain function of `SuggestionProps` in and DOM/React calls
 * out, so a test can drive it with hand-built props and a fake `mount`.
 */
export function artefactSuggestionRenderer() {
  let renderer: ReactRenderer<unknown, ArtefactAutocompleteProps> | null = null;
  let unmount: (() => void) | null = null;
  let activeIndex = 0;
  let current: SuggestionProps<ArtefactSearchRow> | null = null;

  const viewProps = (
    props: SuggestionProps<ArtefactSearchRow>,
  ): ArtefactAutocompleteProps => ({
    id: LIST_ID,
    rows: props.items,
    activeIndex,
    onHover: (index) => {
      activeIndex = index;
      renderer?.updateProps(viewProps(props));
    },
    onSelect: (row) => props.command(row),
  });

  const close = () => {
    unmount?.();
    renderer?.destroy();
    renderer = null;
    unmount = null;
    current = null;
  };

  const move = (delta: number) => {
    if (current === null || current.items.length === 0) return;
    activeIndex =
      (activeIndex + delta + current.items.length) % current.items.length;
    renderer?.updateProps(viewProps(current));
  };

  return {
    onStart: (props: SuggestionProps<ArtefactSearchRow>) => {
      activeIndex = 0;
      current = props;
      renderer = new ReactRenderer(ArtefactAutocomplete, {
        editor: props.editor,
        props: viewProps(props),
      });
      unmount = props.mount(renderer.element);
    },
    onUpdate: (props: SuggestionProps<ArtefactSearchRow>) => {
      activeIndex = 0;
      current = props;
      renderer?.updateProps(viewProps(props));
    },
    onKeyDown: ({ event }: { event: KeyboardEvent }): boolean => {
      if (current === null) return false;
      if (event.key === "ArrowDown") {
        move(1);
        return true;
      }
      if (event.key === "ArrowUp") {
        move(-1);
        return true;
      }
      if (event.key === "Enter") {
        const row = current.items[activeIndex];
        if (row !== undefined) current.command(row);
        return true;
      }
      return false;
    },
    onExit: close,
  };
}

/**
 * Wraps `@tiptap/suggestion` for FR-EDT-04's `@` trigger: `search` supplies
 * the match list, `allowsArtefactTrigger` (spec's start-of-line/whitespace/
 * opening-bracket rule) gates whether a match opens at all, and selecting a
 * row inserts its `artefactRef` node pinned to the artefact's latest
 * version (FR-EDT-05).
 */
export function artefactSuggestion({ search }: Options): AnyExtension {
  return Extension.create({
    name: EXTENSION_NAME,
    addProseMirrorPlugins() {
      return [
        Suggestion<ArtefactSearchRow, ArtefactSearchRow>({
          editor: this.editor,
          char: "@",
          // The default prefix check only allows a space before "@"; the
          // full FR-EDT-04 rule (start of line, whitespace, or an opening
          // bracket) is implemented in `allow` below instead.
          allowedPrefixes: null,
          allow: ({ state, range }) => {
            const blockStart = state.doc.resolve(range.from).start();
            const before = state.doc.textBetween(
              blockStart,
              range.from,
              "\n",
              "\n",
            );
            return allowsArtefactTrigger(before);
          },
          items: ({ query }) => search(query),
          command: ({ editor, range, props }) =>
            insertArtefactReference(editor, range, props),
          render: artefactSuggestionRenderer,
        }),
      ];
    },
  });
}
