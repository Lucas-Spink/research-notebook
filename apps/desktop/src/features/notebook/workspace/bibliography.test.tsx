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

  it("goes to and marks the source's entry when its citation is clicked, and unmarks it later", () => {
    const { view } = mountNotebook(cited);
    const chip = view.querySelector(
      '.wtable .citation-chip button[data-citekey="z:u:BBBB3333"]',
    );
    if (chip === null) throw new Error("no citation");
    act(() => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const marked = view.querySelectorAll(".bibliography__entry--marked");
    expect(marked).toHaveLength(1);
    expect(marked[0]?.getAttribute("data-citekey")).toBe("z:u:BBBB3333");
    expect(document.activeElement).toBe(marked[0]);
  });

  it("is a plain section of the page: nothing collapses it, and every entry is always listed", () => {
    const { view } = mountNotebook(cited);
    const section = view.querySelector(".bibliography");
    expect(section?.querySelector("button[aria-expanded]")).toBeNull();
    expect(section?.querySelector("h2")?.textContent).toContain("Bibliography");
    expect(entries(view)).toHaveLength(2);
    // After the whole table, in the page's flow: a sibling that follows it,
    // inside nothing that pins or scrolls it.
    expect(section?.previousElementSibling).toBe(
      view.querySelector(".workspace__main"),
    );
    expect(section?.closest(".pane, .wtable, .workspace__main")).toBeNull();
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
        chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
