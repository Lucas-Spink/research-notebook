import { parseCitationMarkdown } from "@research-notebook/format";
import { PluginKey } from "@tiptap/pm/state";
import {
  Extension,
  ReactRenderer,
  type AnyExtension,
  type JSONContent,
  type Range,
} from "@tiptap/react";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import {
  CITE_MENU_ITEM,
  SlashMenu,
  type SlashMenuItem,
  type SlashMenuProps,
} from "./SlashMenu";

const EXTENSION_NAME = "citeSuggestion";
const LIST_ID = "slash-menu-list";
// Its own key: `artefactSuggestion`'s "@" trigger keeps `@tiptap/suggestion`'s
// default plugin key, so this one needs its own to coexist in the same editor.
const PLUGIN_KEY = new PluginKey("citeSuggestion");

type Options = {
  /** Called once "Cite" is chosen and its trigger text removed, with the document position to insert the citation at. */
  onOpenPicker: (position: number) => void;
};

/** Only "Cite" exists today; filtered by the typed query, as any menu is. */
export function matchingItems(query: string): SlashMenuItem[] {
  const needle = query.toLowerCase();
  return CITE_MENU_ITEM.label.toLowerCase().includes(needle)
    ? [CITE_MENU_ITEM]
    : [];
}

/** Just enough of Tiptap's chainable commands to remove the trigger text
 * (kept narrow so a test can supply a plain fake instead of a real `Editor`). */
type Chainable = {
  focus: () => Chainable;
  deleteRange: (range: Range) => Chainable;
  run: () => boolean;
};
export type DeletableEditor = { chain: () => Chainable };

/** Removes the `/cite` trigger text, then opens the picker where it was. */
export function openCitationPicker(
  editor: DeletableEditor,
  range: Range,
  onOpenPicker: (position: number) => void,
): void {
  editor.chain().focus().deleteRange(range).run();
  onOpenPicker(range.from);
}

/** Just enough of Tiptap's chainable commands to insert one node at a
 * position (kept narrow so a test can supply a plain fake, matching
 * `ArtefactSuggestion.ts`'s `InsertableEditor`). */
type InsertChainable = {
  focus: () => InsertChainable;
  insertContentAt: (position: number, content: JSONContent) => InsertChainable;
  run: () => boolean;
};
export type CitationInsertableEditor = { chain: () => InsertChainable };

/**
 * Inserts the citation picker's composed Markdown (FR-CIT-03) as a real
 * `citation` node, not literal text: a plain text node would have its own
 * `[`/`]` backslash-escaped by the generic Markdown serialiser on the very
 * next save, corrupting the citation (spec 5.7). Parsing it back through
 * `packages/format`'s own citation parser, the same one `parseSectionMarkdown`
 * uses, keeps this one parser deciding what the syntax means (AGENTS.md 2).
 */
export function insertCitation(
  editor: CitationInsertableEditor,
  position: number,
  markdown: string,
): void {
  editor
    .chain()
    .focus()
    .insertContentAt(position, parseCitationMarkdown(markdown))
    .run();
}

/** What `citeSuggestionRenderer()` returns: `@tiptap/suggestion`'s `render` shape. */
export type CiteSuggestionRenderer = ReturnType<typeof citeSuggestionRenderer>;

/**
 * The `/` slash menu's popup lifecycle (FR-CIT-03): mirrors
 * `artefactSuggestionRenderer` — mounts `SlashMenu` via Floating UI
 * (`props.mount`), moves the keyboard-highlighted item on Up/Down, and
 * calls `props.command` on Enter or a click. Escape is handled by
 * `@tiptap/suggestion` itself.
 */
export function citeSuggestionRenderer() {
  let renderer: ReactRenderer<unknown, SlashMenuProps> | null = null;
  let unmount: (() => void) | null = null;
  let activeIndex = 0;
  let current: SuggestionProps<SlashMenuItem> | null = null;

  const viewProps = (
    props: SuggestionProps<SlashMenuItem>,
  ): SlashMenuProps => ({
    id: LIST_ID,
    items: props.items,
    activeIndex,
    onHover: (index) => {
      activeIndex = index;
      renderer?.updateProps(viewProps(props));
    },
    onSelect: (item) => props.command(item),
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
    onStart: (props: SuggestionProps<SlashMenuItem>) => {
      activeIndex = 0;
      current = props;
      renderer = new ReactRenderer(SlashMenu, {
        editor: props.editor,
        props: viewProps(props),
      });
      unmount = props.mount(renderer.element);
    },
    onUpdate: (props: SuggestionProps<SlashMenuItem>) => {
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
        const item = current.items[activeIndex];
        if (item !== undefined) current.command(item);
        return true;
      }
      return false;
    },
    onExit: close,
  };
}

/**
 * Wraps `@tiptap/suggestion` for FR-CIT-03's `/` trigger: typing `/` at the
 * start of a line (Methods or Interpretation only — Results Notes never
 * gets this extension, FR-CIT-09) opens a small menu; choosing "Cite"
 * deletes the trigger text and opens the citation picker where it was.
 */
export function citeSuggestion({ onOpenPicker }: Options): AnyExtension {
  return Extension.create({
    name: EXTENSION_NAME,
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashMenuItem, SlashMenuItem>({
          editor: this.editor,
          pluginKey: PLUGIN_KEY,
          char: "/",
          startOfLine: true,
          allowedPrefixes: null,
          items: ({ query }) => matchingItems(query),
          command: ({ editor, range }) =>
            openCitationPicker(editor, range, onOpenPicker),
          render: citeSuggestionRenderer,
        }),
      ];
    },
  });
}
