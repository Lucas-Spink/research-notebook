import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BinItem } from "../../ipc/bindings";
import { BinPanel } from "./BinPanel";
import type { BinListApi } from "./useBin";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const question: BinItem = {
  stamp: "2026-09-21T10-15-00Z",
  kind: "question",
  name: "Q-001.md",
  original: "_notebook/questions/Q-001.md",
};
const files: BinItem = {
  stamp: "2026-09-22T09-00-00Z",
  kind: "files",
  name: "EXP-002",
  original: "_notebook/experiments/EXP-002",
};

function api(lists: BinItem[][]): BinListApi & { calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    listBin: () => {
      const data = lists[Math.min(calls, lists.length - 1)] ?? [];
      calls += 1;
      return Promise.resolve({ status: "ok" as const, data });
    },
  };
}

async function mount(
  listApi: BinListApi,
  onRestore = vi.fn(() => Promise.resolve({ ok: true, text: "Restored." })),
  writable = true,
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(
      <BinPanel
        api={listApi}
        folder={1}
        writable={writable}
        onRestore={onRestore}
      />,
    );
    return Promise.resolve();
  });
  return { view: container, onRestore };
}

const button = (view: HTMLElement, label: string) =>
  [...view.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent === label,
  );

const click = (element: Element | undefined) =>
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return Promise.resolve();
  });

describe("the Bin panel", () => {
  it("says the bin is empty, and that the person clears it by hand", async () => {
    const { view } = await mount(api([[]]));
    expect(view.textContent).toContain("The bin is empty.");
    expect(view.textContent).toContain("delete the .trash folder");
    expect(view.textContent).toContain("never empties the bin");
  });

  it("offers no way to empty the bin", async () => {
    const { view } = await mount(api([[question, files]]));
    const labels = [...view.querySelectorAll("button")].map(
      (b) => b.textContent,
    );
    expect(labels.filter((l) => /empty|delete|clear/i.test(l ?? ""))).toEqual(
      [],
    );
  });

  it("lists what is in it, newest first, with when it was binned", async () => {
    const { view } = await mount(api([[question, files]]));
    const rows = [...view.querySelectorAll(".bin__list li")].map(
      (li) => li.textContent,
    );
    expect(rows[0]).toContain("Removed files from EXP-002");
    expect(rows[0]).toContain("22 Sep 2026, 09:00 UTC");
    expect(rows[1]).toContain("Question Q-001");
  });

  it("restores the entry asked for, then reads the bin again", async () => {
    const listApi = api([[question], []]);
    const { view, onRestore } = await mount(listApi);
    await click(button(view, "Restore Question Q-001"));
    expect(onRestore).toHaveBeenCalledWith(question);
    expect(view.textContent).toContain("Restored.");
    expect(view.textContent).toContain("The bin is empty.");
    expect(listApi.calls()).toBe(2);
  });

  it("says when the restore did not work, and keeps the entry listed", async () => {
    const onRestore = vi.fn(() =>
      Promise.resolve({ ok: false, text: "Something is already there." }),
    );
    const { view } = await mount(api([[question]]), onRestore);
    await click(button(view, "Restore Question Q-001"));
    expect(view.textContent).toContain("Something is already there.");
    expect(view.querySelectorAll(".bin__list li")).toHaveLength(1);
  });

  it("cannot restore anything in a read-only project", async () => {
    const { view } = await mount(
      api([[question]]),
      vi.fn(() => Promise.resolve({ ok: true, text: "" })),
      false,
    );
    expect(view.textContent).toContain("read-only");
    expect(button(view, "Restore Question Q-001")?.disabled).toBe(true);
  });

  it("says so when the bin cannot be read", async () => {
    const failing: BinListApi = {
      listBin: () =>
        Promise.resolve({
          status: "error" as const,
          error: { kind: "fileUnavailable" as const },
        }),
    };
    const { view } = await mount(failing);
    expect(view.querySelector('[role="alert"]')?.textContent).toContain(
      "could not be read",
    );
  });
});
