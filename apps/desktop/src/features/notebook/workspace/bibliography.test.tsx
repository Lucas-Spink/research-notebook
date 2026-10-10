import type {
  LoadedExperiment,
  NotebookState,
} from "@research-notebook/format";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { sampleNotebook } from "../model/fakeApi";
import { mountNotebook, prepareInteractiveTable } from "../table/tableTesting";

/**
 * S6-T01: Literature has no column; citations in the text are interactive
 * references, and the Bibliography below the table lists every source cited.
 */

const { state } = sampleNotebook();
prepareInteractiveTable();

function withMethods(from: NotebookState, folder: string, body: string) {
  const change = (e: LoadedExperiment): LoadedExperiment => ({
    ...e,
    file: {
      ...e.file,
      body: {
        ...e.file.body,
        sections: e.file.body.sections.map((s) =>
          s.key === "methods" ? { ...s, body } : s,
        ),
      },
    },
  });
  return {
    ...from,
    experiments: from.experiments.map((e) =>
      e.folder === folder ? change(e) : e,
    ),
  };
}

const cited = withMethods(
  withMethods(
    state,
    "EXP-001",
    "Counts [@z:u:AAAA2222] and @z:u:BBBB3333 [p. 2].",
  ),
  "EXP-002",
  "Again [@z:u:AAAA2222].",
);

const entries = (view: HTMLElement) => [
  ...view.querySelectorAll(".bibliography__entry"),
];

describe("citations and the Bibliography (S6-T01)", () => {
  it("has no Literature column", () => {
    const { view } = mountNotebook(state);
    const headings = [...view.querySelectorAll('[role="columnheader"]')].map(
      (h) => h.textContent,
    );
    expect(headings).not.toContain("Literature");
  });

  it("is always below the table, and says when nothing is cited", () => {
    const { view } = mountNotebook(state);
    const section = view.querySelector(".bibliography");
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain("No sources are cited");
    expect(view.querySelector(".workspace__main")?.nextElementSibling).toBe(
      section,
    );
  });

  it("lists each source cited anywhere in the project once", () => {
    const { view } = mountNotebook(cited);
    expect(
      entries(view)
        .map((e) => e.getAttribute("data-citekey"))
        .sort(),
    ).toEqual(["z:u:AAAA2222", "z:u:BBBB3333"]);
  });

  it("shows cited text as interactive references in the table's cells", () => {
    const { view } = mountNotebook(cited);
    const chips = view.querySelectorAll(".wtable .citation-chip button");
    expect(chips).toHaveLength(3);
  });

  it("goes to and marks the source's entry when its citation is double-clicked", () => {
    const { view } = mountNotebook(cited);
    const chip = view.querySelector(
      '.wtable .citation-chip button[data-citekey="z:u:BBBB3333"]',
    );
    if (chip === null) throw new Error("no citation");
    act(() => {
      chip.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const marked = view.querySelectorAll(".bibliography__entry--marked");
    expect(marked).toHaveLength(1);
    expect(marked[0]?.getAttribute("data-citekey")).toBe("z:u:BBBB3333");
    expect(document.activeElement).toBe(marked[0]);
  });

  it("opens the source in the side pane on a single click, and does not scroll to the Bibliography", async () => {
    const { view } = mountNotebook(cited);
    const chip = view.querySelector(
      '.wtable .citation-chip button[data-citekey="z:u:BBBB3333"]',
    );
    if (chip === null) throw new Error("no citation");
    act(() => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(
      [...view.querySelectorAll('aside.pane [role="tab"]')].map(
        (t) => t.textContent,
      ),
    ).toEqual(["Sources"]);
    expect(view.querySelectorAll(".bibliography__entry--marked")).toHaveLength(
      0,
    );
  });

  it("is a section of the page that starts open and can be collapsed (#101)", () => {
    const { view } = mountNotebook(cited);
    const section = view.querySelector(".bibliography");
    const toggle = section?.querySelector("button[aria-expanded]");
    if (!(toggle instanceof HTMLElement)) throw new Error("no toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(section?.querySelector("h2")?.textContent).toContain("Bibliography");
    expect(entries(view)).toHaveLength(2);
    // After the whole table, in the page's flow: a sibling that follows it,
    // inside nothing that pins or scrolls it.
    expect(section?.previousElementSibling).toBe(
      view.querySelector(".workspace__main"),
    );
    expect(section?.closest(".pane, .wtable, .workspace__main")).toBeNull();

    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(entries(view)).toHaveLength(0);
    // The count stays visible while the list is hidden.
    expect(section?.textContent).toContain("2");
  });

  it("opens a collapsed Bibliography to show the entry of a clicked citation", () => {
    const { view } = mountNotebook(cited);
    const toggle = view.querySelector(".bibliography button[aria-expanded]");
    if (!(toggle instanceof HTMLElement)) throw new Error("no toggle");
    act(() => toggle.click());
    expect(entries(view)).toHaveLength(0);
    const chip = view.querySelector(
      '.wtable .citation-chip button[data-citekey="z:u:BBBB3333"]',
    );
    if (chip === null) throw new Error("no citation");
    act(() => {
      chip.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      view
        .querySelector(".bibliography__entry--marked")
        ?.getAttribute("data-citekey"),
    ).toBe("z:u:BBBB3333");
  });

  it("scrolls the page to the entry of a clicked citation", () => {
    const scroll = vi.fn();
    // jsdom has no scrollIntoView, so one is put on the prototype for this test.
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scroll,
    });
    try {
      const { view } = mountNotebook(cited);
      const chip = view.querySelector(
        '.wtable .citation-chip button[data-citekey="z:u:AAAA2222"]',
      );
      if (chip === null) throw new Error("no citation");
      act(() => {
        chip.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.instances[0]).toBe(
        view.querySelector('.bibliography__entry[data-citekey="z:u:AAAA2222"]'),
      );
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });
});
