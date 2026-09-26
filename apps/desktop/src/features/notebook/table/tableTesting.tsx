import type {
  NotebookState,
  RecognisedSectionKey,
} from "@research-notebook/format";
import { Editor } from "@tiptap/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll } from "vitest";
import { columnLabel, editLabel, selectLabel } from "../messages";
import { stubActions, testModel } from "../model/testModel";
import { NotebookView } from "../NotebookView";
import type { NotebookModel } from "../useNotebook";

/** For tests of the interactive table: one save of one section, as `editExperimentSection` received it. */
export type Saved = [string, RecognisedSectionKey, string];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/**
 * Registers the hooks every interactive table test needs. jsdom lays
 * nothing out, so every element measures 0 × 0 and the virtualiser would
 * draw no rows; the table's scroll area is given a window's size, as a real
 * layout would, and nothing else changes. Each test's notebook is unmounted
 * after it.
 */
export function prepareInteractiveTable() {
  const sized = { offsetHeight: 720, offsetWidth: 1600 };
  const elementOriginals = Object.keys(sized).map(
    (name): [string, PropertyDescriptor | undefined] => [
      name,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
    ],
  );
  // ProseMirror scrolls the caret into view when an editor takes focus, and
  // jsdom has no layout for ranges; an empty one is enough.
  const rangeLayout = {
    getClientRects: () => [],
    getBoundingClientRect: () => new DOMRect(),
  };
  const rangeOriginals = Object.keys(rangeLayout).map(
    (name): [string, PropertyDescriptor | undefined] => [
      name,
      Object.getOwnPropertyDescriptor(Range.prototype, name),
    ],
  );
  beforeAll(() => {
    for (const [name, size] of Object.entries(sized)) {
      Object.defineProperty(HTMLElement.prototype, name, {
        configurable: true,
        get(this: HTMLElement) {
          return this.classList.contains("wtable") ? size : 0;
        },
      });
    }
    for (const [name, value] of Object.entries(rangeLayout)) {
      Object.defineProperty(Range.prototype, name, {
        configurable: true,
        value,
      });
    }
  });
  afterAll(() => {
    restore(HTMLElement.prototype, elementOriginals);
    restore(Range.prototype, rangeOriginals);
  });
  afterEach(unmountNotebook);
}

function restore(
  target: object,
  originals: readonly [string, PropertyDescriptor | undefined][],
) {
  for (const [name, descriptor] of originals) {
    if (descriptor === undefined) Reflect.deleteProperty(target, name);
    else Object.defineProperty(target, name, descriptor);
  }
}

/** Unmounts the notebook `mountNotebook` last mounted, if any. */
export function unmountNotebook() {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
}

/** Mounts `NotebookView` over `state` as a writable project, recording every section save. */
export function mountNotebook(
  state: NotebookState,
  overrides: Partial<NotebookModel> = {},
): { view: HTMLElement; saved: Saved[] } {
  const saved: Saved[] = [];
  const notebook = testModel(state, {
    actions: {
      ...stubActions,
      editExperimentSection: (id, key, text) => {
        saved.push([id, key, text]);
        return Promise.resolve({ ok: true });
      },
    },
    ...overrides,
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const place = document.createElement("div");
  document.body.append(place);
  container = place;
  root = createRoot(place);
  act(() => root?.render(<NotebookView notebook={notebook} folder={1} />));
  return { view: place, saved };
}

export function tableOf(view: HTMLElement): HTMLElement {
  const found = view.querySelector(".wtable");
  if (!(found instanceof HTMLElement)) throw new Error("no table");
  return found;
}

export function detailsOf(view: HTMLElement): HTMLElement {
  const found = view.querySelector(".notebook__details");
  if (!(found instanceof HTMLElement)) throw new Error("no details panel");
  return found;
}

/** The table row of the experiment `ref`. */
export function rowOf(view: HTMLElement, ref: string): HTMLElement {
  const button = tableOf(view).querySelector(
    `button[aria-label="${selectLabel(ref)}"]`,
  );
  const row = button?.closest('[role="row"]');
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${ref}`);
  return row;
}

/** The selector for a section cell's "Edit …" control. */
export const editControl = (key: RecognisedSectionKey) =>
  `[role="button"][aria-label="${editLabel(columnLabel(key))}"]`;

/** Opens the experiment `ref`'s section `key` for editing with a click. */
export async function openCell(
  view: HTMLElement,
  ref: string,
  key: RecognisedSectionKey,
) {
  const cell = rowOf(view, ref).querySelector(editControl(key));
  if (cell === null) throw new Error(`no editable ${key} cell for ${ref}`);
  await act(async () => {
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

/** Changes the live editor's document under `place` the way typing would, through its own commands. */
export function typeInto(place: HTMLElement, text: string) {
  const pm = place.querySelector(".ProseMirror");
  const editor: unknown = pm === null ? null : Reflect.get(pm, "editor");
  if (!(editor instanceof Editor)) throw new Error("no live editor");
  act(() => {
    editor.commands.insertContent(text);
  });
}
