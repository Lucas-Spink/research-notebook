import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CitationPicker } from "./CitationPicker";
import type { CitationSearchApi } from "./model/citationSearchApi";

/**
 * S5-G04's citation-picker slice: "picker shows offline state." The
 * gate's other half — existing citations rendering from bibliography.json
 * — is S5-T04/S5-T05's, not this task's.
 */

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

function nativeSetValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
}

function fakeApi(reply: unknown): CitationSearchApi {
  const api = { zoteroSearchItems: () => Promise.resolve(reply) };
  // The fake has the same shape as the generated command.
  return api as unknown as CitationSearchApi;
}

function mount(api: CitationSearchApi) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <CitationPicker
        api={api}
        onInsert={() => undefined}
        onCancel={() => undefined}
      />,
    ),
  );
  return container;
}

async function search(view: HTMLElement, text: string) {
  const input = view.querySelector<HTMLInputElement>('input[type="text"]');
  if (input === null) throw new Error("no search input");
  act(() => {
    nativeSetValue(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => vi.advanceTimersByTimeAsync(DELAY));
}

describe("citation picker offline states (S5-G04)", () => {
  it("shows the not-running state, matching the status indicator's wording", async () => {
    const view = mount(
      fakeApi({ status: "error", error: { kind: "notRunning" } }),
    );
    await search(view, "widget");
    const status = view.querySelector('[role="status"]');
    expect(status?.textContent).toMatch(/not detected/);
    expect(status?.textContent).not.toMatch(/could not be completed/);
  });

  it("shows the disabled state, matching the status indicator's wording", async () => {
    const view = mount(
      fakeApi({ status: "error", error: { kind: "disabled" } }),
    );
    await search(view, "widget");
    const status = view.querySelector('[role="status"]');
    expect(status?.textContent).toMatch(/switched off/);
    expect(status?.textContent).not.toMatch(/could not be completed/);
  });

  it("does not offer any results while offline", async () => {
    const view = mount(
      fakeApi({ status: "error", error: { kind: "notRunning" } }),
    );
    await search(view, "widget");
    expect(view.querySelector('[aria-label="Search results"]')).toBeNull();
  });
});
