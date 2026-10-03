import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CitationPicker } from "./CitationPicker";
import type { CitationSearchApi } from "./model/citationSearchApi";

const DELAY = 300;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.useRealTimers();
});

/** Sets a controlled input's value the way a person typing does: through
 * the native setter React itself overrides, so its change handler fires. */
function nativeSetValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
): void {
  const prototype =
    element instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
    element,
    value,
  );
}

function setText(input: HTMLInputElement | null, value: string) {
  if (input === null) throw new Error("input not found");
  act(() => {
    nativeSetValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function setSelect(select: HTMLSelectElement | null, value: string) {
  if (select === null) throw new Error("select not found");
  act(() => {
    nativeSetValue(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function click(element: Element | null | undefined) {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function fakeApi(reply: unknown): CitationSearchApi {
  const api = { zoteroSearchItems: () => Promise.resolve(reply) };
  // The fake has the same shape as the generated command.
  return api as unknown as CitationSearchApi;
}

const ROW = {
  citekey: "z:u:7XK2PQ9M",
  title: "A Study of Widgets",
  creatorSummary: "Smith",
  itemType: "journalArticle",
};

function mount(
  api: CitationSearchApi,
  onInsert: (markdown: string) => void = () => undefined,
  onCancel: () => void = () => undefined,
  onInsertCitekeys?: (citekeys: readonly string[]) => void,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <CitationPicker
        api={api}
        onInsert={onInsert}
        onCancel={onCancel}
        {...(onInsertCitekeys === undefined ? {} : { onInsertCitekeys })}
      />,
    ),
  );
  return container;
}

function searchInput(view: HTMLElement): HTMLInputElement | null {
  return view.querySelector<HTMLInputElement>('input[type="text"]');
}

function fieldByPlaceholder(
  view: HTMLElement,
  placeholder: string,
): HTMLInputElement | null {
  return (
    [...view.querySelectorAll<HTMLInputElement>('input[type="text"]')].find(
      (input) => input.placeholder === placeholder,
    ) ?? null
  );
}

async function search(view: HTMLElement, text: string) {
  setText(searchInput(view), text);
  await act(() => vi.advanceTimersByTimeAsync(DELAY));
}

describe("CitationPicker (FR-CIT-03)", () => {
  it("shows an idle hint before anything is typed", () => {
    const view = mount(fakeApi({ status: "ok", data: [] }));
    expect(view.querySelector('[role="status"]')?.textContent).toMatch(
      /Type to search/,
    );
  });

  it("shows the matching results once the debounced search resolves", async () => {
    const view = mount(fakeApi({ status: "ok", data: [ROW] }));
    await search(view, "widget");
    expect(view.textContent).toContain("A Study of Widgets");
    expect(view.textContent).toContain("Smith");
  });

  it("shows an empty message when nothing matches", async () => {
    const view = mount(fakeApi({ status: "ok", data: [] }));
    await search(view, "widget");
    expect(view.querySelector('[role="status"]')?.textContent).toMatch(
      /No matching sources/,
    );
  });

  it("shows the same offline wording as the status indicator when Zotero is not running (S5-G04)", async () => {
    const view = mount(
      fakeApi({ status: "error", error: { kind: "notRunning" } }),
    );
    await search(view, "widget");
    expect(view.querySelector('[role="status"]')?.textContent).toMatch(
      /not detected/,
    );
  });

  it("shows the same offline wording as the status indicator when Zotero's local API is disabled (S5-G04)", async () => {
    const view = mount(
      fakeApi({ status: "error", error: { kind: "disabled" } }),
    );
    await search(view, "widget");
    expect(view.querySelector('[role="status"]')?.textContent).toMatch(
      /switched off/,
    );
  });

  it("disables Insert until a source is selected", async () => {
    const view = mount(fakeApi({ status: "ok", data: [ROW] }));
    await search(view, "widget");
    const insert = [...view.querySelectorAll("button")].find(
      (button) => button.textContent === "Insert citation",
    );
    expect(insert?.disabled).toBe(true);

    click(view.querySelector('input[type="checkbox"]'));
    expect(insert?.disabled).toBe(false);
  });

  it("shows a selected source under Selected sources with its own fields", async () => {
    const view = mount(fakeApi({ status: "ok", data: [ROW] }));
    await search(view, "widget");
    click(view.querySelector('input[type="checkbox"]'));

    expect(view.textContent).toContain("Selected sources");
    expect(view.querySelector("select")).not.toBeNull();
  });

  it("removes a source from the selection when unchecked again", async () => {
    const view = mount(fakeApi({ status: "ok", data: [ROW] }));
    await search(view, "widget");
    const checkbox = view.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    click(checkbox);
    expect(view.textContent).toContain("Selected sources");
    click(checkbox);
    expect(view.textContent).not.toContain("Selected sources");
  });

  it("inserts a bare citekey when nothing else is filled in", async () => {
    const onInsert = vi.fn();
    const view = mount(fakeApi({ status: "ok", data: [ROW] }), onInsert);
    await search(view, "widget");
    click(view.querySelector('input[type="checkbox"]'));

    const insert = [...view.querySelectorAll("button")].find(
      (button) => button.textContent === "Insert citation",
    );
    click(insert);
    expect(onInsert).toHaveBeenCalledWith("[@z:u:7XK2PQ9M]");
  });

  it("also reports the citekeys inserted, so their sources can be cached (FR-CIT-05)", async () => {
    const onInsertCitekeys = vi.fn();
    const view = mount(
      fakeApi({ status: "ok", data: [ROW] }),
      () => undefined,
      () => undefined,
      onInsertCitekeys,
    );
    await search(view, "widget");
    click(view.querySelector('input[type="checkbox"]'));
    click(
      [...view.querySelectorAll("button")].find(
        (button) => button.textContent === "Insert citation",
      ),
    );
    expect(onInsertCitekeys).toHaveBeenCalledWith(["z:u:7XK2PQ9M"]);
  });

  it("composes the locator, prefix and suffix into the inserted text", async () => {
    const onInsert = vi.fn();
    const view = mount(fakeApi({ status: "ok", data: [ROW] }), onInsert);
    await search(view, "widget");
    click(view.querySelector('input[type="checkbox"]'));

    setSelect(view.querySelector("select"), "figure");
    setText(fieldByPlaceholder(view, "e.g. 6 or 10-12"), "2");
    setText(fieldByPlaceholder(view, "e.g. see"), "see");
    setText(fieldByPlaceholder(view, "e.g. emphasis added"), "emphasis added");

    const insert = [...view.querySelectorAll("button")].find(
      (button) => button.textContent === "Insert citation",
    );
    click(insert);
    expect(onInsert).toHaveBeenCalledWith(
      "[see @z:u:7XK2PQ9M, figure 2, emphasis added]",
    );
  });

  it("cancels without inserting on the Cancel button", () => {
    const onInsert = vi.fn();
    const onCancel = vi.fn();
    const view = mount(
      fakeApi({ status: "ok", data: [ROW] }),
      onInsert,
      onCancel,
    );
    const cancel = [...view.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel",
    );
    click(cancel);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it("cancels without inserting on Escape, from anywhere in the dialog", () => {
    const onCancel = vi.fn();
    const view = mount(
      fakeApi({ status: "ok", data: [ROW] }),
      () => undefined,
      onCancel,
    );
    act(() => {
      view.querySelector('[role="dialog"]')?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("CitationPicker in replace mode (FR-CIT-08)", () => {
  const OTHER_ROW = { ...ROW, citekey: "z:u:ABCD2345", title: "Another" };

  function mountReplace(onInsertCitekeys: (keys: readonly string[]) => void) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        <CitationPicker
          mode="replace"
          exclude={ROW.citekey}
          api={fakeApi({ status: "ok", data: [ROW, OTHER_ROW] })}
          onInsert={() => undefined}
          onInsertCitekeys={onInsertCitekeys}
          onCancel={() => undefined}
        />,
      ),
    );
    return container;
  }

  it("chooses exactly one source, hides the source being replaced, and offers no locator", async () => {
    const chosen = vi.fn();
    const view = mountReplace(chosen);
    await search(view, "w");
    expect(view.textContent).not.toContain(ROW.title);
    expect(view.querySelectorAll('input[type="radio"]')).toHaveLength(1);
    expect(view.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    click(view.querySelector('input[type="radio"]'));
    expect(fieldByPlaceholder(view, "e.g. 6 or 10-12")).toBeNull();
    const use = [...view.querySelectorAll("button")].find(
      (b) => b.textContent === "Use this source",
    );
    click(use);
    expect(chosen).toHaveBeenCalledWith(["z:u:ABCD2345"]);
  });

  it("keeps Use this source disabled until one is chosen", async () => {
    const view = mountReplace(() => undefined);
    await search(view, "w");
    const use = [...view.querySelectorAll("button")].find(
      (b) => b.textContent === "Use this source",
    );
    expect(use?.disabled).toBe(true);
  });
});

describe("CitationPicker: several citations at once (S6-T01)", () => {
  const SECOND = {
    citekey: "z:u:ABCD2345",
    title: "More Widgets",
    creatorSummary: "Jones",
    itemType: "book",
  };

  async function pickBoth(onInsert: (markdown: string) => void) {
    const view = mount(
      fakeApi({ status: "ok", data: [ROW, SECOND] }),
      onInsert,
    );
    await search(view, "widget");
    for (const box of view.querySelectorAll('input[type="checkbox"]')) {
      click(box);
    }
    return view;
  }

  const insertButton = (view: HTMLElement) =>
    [...view.querySelectorAll("button")].find(
      (button) => button.textContent === "Insert citation",
    );

  it("keeps the selection while searching again, and counts it", async () => {
    const view = await pickBoth(() => undefined);
    expect(view.textContent).toContain("2 sources selected");
    await search(view, "other");
    expect(view.textContent).toContain("2 sources selected");
  });

  it("inserts the sources as one cluster by default", async () => {
    const onInsert = vi.fn();
    const view = await pickBoth(onInsert);
    click(insertButton(view));
    expect(onInsert).toHaveBeenCalledWith("[@z:u:7XK2PQ9M; @z:u:ABCD2345]");
  });

  it("can insert a citation for each source instead", async () => {
    const onInsert = vi.fn();
    const view = await pickBoth(onInsert);
    const separate = [...view.querySelectorAll("label")].find((label) =>
      label.textContent?.includes("Insert as separate citations"),
    );
    click(separate?.querySelector("input"));
    click(insertButton(view));
    expect(onInsert).toHaveBeenCalledWith("[@z:u:7XK2PQ9M] [@z:u:ABCD2345]");
  });

  it("clears the whole selection in one press", async () => {
    const view = await pickBoth(() => undefined);
    click(
      [...view.querySelectorAll("button")].find(
        (button) => button.textContent === "Clear selection",
      ),
    );
    expect(view.textContent).toContain("0 sources selected");
  });

  it("inserts with Ctrl+Enter once something is selected", async () => {
    const onInsert = vi.fn();
    const view = await pickBoth(onInsert);
    act(() => {
      view.querySelector('[role="dialog"]')?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    expect(onInsert).toHaveBeenCalledTimes(1);
  });
});
