import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  type NotebookState,
} from "@research-notebook/format";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { selectLabel } from "../messages";
import { sampleNotebook } from "../model/fakeApi";
import {
  mountNotebook,
  openCell,
  prepareInteractiveTable,
  rowOf,
} from "../table/tableTesting";

/**
 * S6-T01: the table is the workspace; the ribbon holds the controls; sources
 * and results open in one side pane that gives the table its width back
 * when closed.
 */

const { state } = sampleNotebook();
prepareInteractiveTable();

const figure = ArtefactsFile.parse({
  ...EMPTY_ARTEFACTS,
  artefacts: [
    {
      id: "01JB0000000000000000000001",
      name: "PCA plot",
      role: "result",
      mode: "copy",
      type: "image",
      source: { root: "project", path: "results/pca.png" },
      created: "2026-09-26T10:00:00Z",
      versions: [
        {
          v: 1,
          file: "evidence/pca.png",
          sha256: "a".repeat(64),
          size: 10,
          captured: "2026-09-26T10:00:00Z",
        },
      ],
    },
  ],
});
const withFigure: NotebookState = {
  ...state,
  artefacts: { ...state.artefacts, "EXP-001": { kind: "file", file: figure } },
};

const ribbonButton = (view: HTMLElement, label: string): HTMLElement => {
  const found = [...view.querySelectorAll('[role="toolbar"] button')].find(
    (button) => button.textContent === label,
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no ${label} button`);
  return found;
};

const click = (element: Element) =>
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

const pane = (view: HTMLElement) => view.querySelector("aside.pane");

const ribbonTab = (view: HTMLElement, label: string): HTMLElement => {
  const found = [...view.querySelectorAll('.ribbon [role="tab"]')].find(
    (tab) => tab.textContent === label,
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no ${label} tab`);
  return found;
};

const groupsOf = (view: HTMLElement) =>
  [...view.querySelectorAll('[role="toolbar"] [role="group"]')].map((g) =>
    g.getAttribute("aria-label"),
  );

describe("the workspace (S6-T01)", () => {
  it("has Home, Experiments, Sources, View and Project tabs, and shows only the chosen tab's groups", () => {
    const { view } = mountNotebook(state);
    expect(
      [...view.querySelectorAll('.ribbon [role="tab"]')].map(
        (t) => t.textContent,
      ),
    ).toEqual(["Home", "Experiments", "Sources", "View", "Project"]);
    expect(ribbonTab(view, "Home").getAttribute("aria-selected")).toBe("true");
    expect(groupsOf(view)).toEqual(["Add", "Selection", "Panes"]);

    click(ribbonTab(view, "View"));
    expect(ribbonTab(view, "View").getAttribute("aria-selected")).toBe("true");
    expect(groupsOf(view)).toEqual(["Table", "Rows"]);
    expect(ribbonButton(view, "Columns").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(view.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);

    click(ribbonTab(view, "Sources"));
    expect(groupsOf(view)).toEqual(["Library", "Attach", "Citations"]);
    click(ribbonTab(view, "Experiments"));
    expect(groupsOf(view)).toEqual(["Questions", "Find", "Order", "Results"]);
  });

  it("moves between ribbon tabs with the arrow keys", () => {
    const { view } = mountNotebook(state);
    act(() => {
      ribbonTab(view, "Home").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(ribbonTab(view, "Experiments").getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("collapses to its tabs, shows a tab's commands over the table when one is chosen, and expands again", () => {
    const { view } = mountNotebook(state);
    const toggle = view.querySelector(".ribbon__collapse");
    if (toggle === null) throw new Error("no collapse button");
    click(toggle);
    expect(view.querySelector('[role="toolbar"]')).toBeNull();

    click(ribbonTab(view, "View"));
    expect(view.querySelector(".ribbon__commands--peek")).not.toBeNull();
    expect(groupsOf(view)).toEqual(["Table", "Rows"]);
    act(() => {
      view
        .querySelector(".ribbon")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
    });
    expect(view.querySelector('[role="toolbar"]')).toBeNull();

    click(toggle);
    expect(view.querySelector('[role="toolbar"]')).not.toBeNull();
    expect(view.querySelector(".ribbon__commands--peek")).toBeNull();
  });

  it("has no permanent Sources list or Source details, and no side pane, at first", () => {
    const { view } = mountNotebook(state);
    expect(view.querySelector(".citations__sources")).toBeNull();
    expect(view.querySelector(".citations__details")).toBeNull();
    expect(pane(view)).toBeNull();
    expect(view.querySelector(".workspace__table .wtable")).not.toBeNull();
  });

  it("opens Sources from the ribbon in the side pane, and closes it again", () => {
    const { view } = mountNotebook(state);
    click(ribbonButton(view, "Sources"));
    expect(pane(view)).not.toBeNull();
    expect(pane(view)?.querySelector(".citations__sources")).not.toBeNull();
    // The table is beside the pane, not under it.
    expect(
      view.querySelector(".workspace__main > .workspace__table"),
    ).not.toBeNull();

    const closeAll = [...(pane(view)?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Close pane",
    );
    if (closeAll === undefined) throw new Error("no close button");
    click(closeAll);
    expect(pane(view)).toBeNull();
  });

  it("shows several tabs in one pane and closes them one at a time", () => {
    const { view } = mountNotebook(state);
    click(ribbonButton(view, "Sources"));
    click(ribbonTab(view, "Sources"));
    click(ribbonButton(view, "Citation style"));
    const tabs = () =>
      [...view.querySelectorAll('aside.pane [role="tab"]')].map(
        (t) => t.textContent,
      );
    expect(tabs()).toEqual(["Sources", "Citation style"]);
    const closeStyle = view.querySelector(
      'button[aria-label="Close Citation style"]',
    );
    if (closeStyle === null) throw new Error("no close tab button");
    click(closeStyle);
    expect(tabs()).toEqual(["Sources"]);
  });

  it("resizes the pane with the arrow keys, within limits", () => {
    const { view } = mountNotebook(state);
    click(ribbonButton(view, "Sources"));
    const separator = view.querySelector(".pane__resize");
    if (!(separator instanceof HTMLElement)) throw new Error("no separator");
    const before = Number(separator.getAttribute("aria-valuenow"));
    act(() => {
      separator.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });
    expect(Number(separator.getAttribute("aria-valuenow"))).toBeGreaterThan(
      before,
    );
  });

  it("opens a result in the pane on double-click, keeping the table beside it", () => {
    const { view } = mountNotebook(withFigure);
    const thumb = rowOf(view, "EXP-001").querySelector(".wtable__thumb");
    if (thumb === null) throw new Error("no thumbnail");
    act(() => {
      thumb.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(
      [...view.querySelectorAll('aside.pane [role="tab"]')].map(
        (t) => t.textContent,
      ),
    ).toEqual(["PCA plot"]);
    // The row's Results cell did not open: only the pane did.
    expect(rowOf(view, "EXP-001").querySelector('[role="tree"]')).toBeNull();
    expect(view.querySelector(".wtable")).not.toBeNull();
  });

  it("shows a larger preview while a thumbnail is hovered", () => {
    const { view } = mountNotebook(withFigure);
    const thumb = rowOf(view, "EXP-001").querySelector(".wtable__thumb");
    if (thumb === null) throw new Error("no thumbnail");
    act(() => {
      thumb.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(document.body.querySelector(".wtable__hover")).not.toBeNull();
  });

  it("selects a row, then opens Details from the ribbon", () => {
    const { view } = mountNotebook(state);
    expect(ribbonButton(view, "Details").hasAttribute("disabled")).toBe(true);
    const select = rowOf(view, "EXP-001").querySelector(
      `button[aria-label="${selectLabel("EXP-001")}"]`,
    );
    if (select === null) throw new Error("no title");
    click(select);
    click(ribbonButton(view, "Details"));
    expect(pane(view)?.querySelector(".notebook__details")).not.toBeNull();
  });

  it("adds results from a pane opened by the plus in the Results cell", () => {
    const { view } = mountNotebook(state);
    const plus = rowOf(view, "EXP-001").querySelector(
      'button[aria-label="Add a result to EXP-001"]',
    );
    if (plus === null) throw new Error("no plus");
    click(plus);
    expect(
      [...view.querySelectorAll('aside.pane [role="tab"]')].map(
        (t) => t.textContent,
      ),
    ).toEqual(["Add result"]);
    expect(pane(view)?.textContent).toContain("Add results to EXP-001");
    expect(
      [...(pane(view)?.querySelectorAll("button") ?? [])].some(
        (b) => b.textContent === "Add files…",
      ),
    ).toBe(true);
    // The cell itself did not open into the folder tree.
    expect(rowOf(view, "EXP-001").querySelector('[role="tree"]')).toBeNull();
  });

  it("opens the same pane from the ribbon's Add result for the selected experiment", () => {
    const { view } = mountNotebook(state);
    expect(ribbonButton(view, "Add result").hasAttribute("disabled")).toBe(
      true,
    );
    const select = rowOf(view, "EXP-002").querySelector(
      `button[aria-label="${selectLabel("EXP-002")}"]`,
    );
    if (select === null) throw new Error("no title");
    click(select);
    click(ribbonButton(view, "Add result"));
    expect(pane(view)?.textContent).toContain("Add results to EXP-002");
  });

  it("folds the pane into a rail of small square icons, one per open tab, to click through", () => {
    const { view } = mountNotebook(withFigure);
    const thumb = rowOf(view, "EXP-001").querySelector(".wtable__thumb");
    if (thumb === null) throw new Error("no result");
    act(() => {
      thumb.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    click(ribbonButton(view, "Sources"));
    expect(pane(view)).not.toBeNull();

    const minimise = view.querySelector(
      'button[aria-label="Minimise the side pane"]',
    );
    if (minimise === null) throw new Error("no minimise button");
    click(minimise);

    // The pane is gone from beside the table, but its tabs are all still open.
    expect(pane(view)).toBeNull();
    const rail = view.querySelector(".pane-rail");
    expect(rail).not.toBeNull();
    const tabs = [...(rail?.querySelectorAll(".pane-rail__tab") ?? [])];
    expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual([
      "PCA plot",
      "Sources",
    ]);
    for (const tab of tabs) {
      expect(tab.querySelector("svg.artefact-icon")).not.toBeNull();
    }
    expect(view.querySelector(".wtable")).not.toBeNull();

    // Clicking an icon unfolds the pane on that tab, without losing the others.
    click(tabs[0] as Element);
    expect(view.querySelector(".pane-rail")).toBeNull();
    expect(
      pane(view)?.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent,
    ).toBe("PCA plot");
    expect(
      [...(pane(view)?.querySelectorAll('[role="tab"]') ?? [])].map(
        (t) => t.textContent,
      ),
    ).toEqual(["PCA plot", "Sources"]);
  });

  it("unfolds from the rail's own button", () => {
    const { view } = mountNotebook(state);
    click(ribbonButton(view, "Sources"));
    click(
      view.querySelector(
        'button[aria-label="Minimise the side pane"]',
      ) as Element,
    );
    click(
      view.querySelector('button[aria-label="Show the side pane"]') as Element,
    );
    expect(pane(view)).not.toBeNull();
  });

  it("opens a figure referenced in the text in the side pane, not full size", async () => {
    const referenced: NotebookState = {
      ...withFigure,
      experiments: withFigure.experiments.map((e) =>
        e.folder === "EXP-001"
          ? {
              ...e,
              file: {
                ...e.file,
                body: {
                  ...e.file.body,
                  sections: e.file.body.sections.map((section) =>
                    section.key === "methods"
                      ? {
                          ...section,
                          body: 'See [PCA plot](evidence/pca.png "art:01JB0000000000000000000001 v1").',
                        }
                      : section,
                  ),
                },
              },
            }
          : e,
      ),
    };
    const { view } = mountNotebook(referenced);
    await openCell(view, "EXP-001", "methods");
    const chip = rowOf(view, "EXP-001").querySelector(
      ".expanded__artefact-ref--chip",
    );
    if (chip === null) throw new Error("no figure chip in the editor");
    act(() => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      [...view.querySelectorAll('aside.pane [role="tab"]')].map(
        (t) => t.textContent,
      ),
    ).toEqual(["PCA plot"]);
    // No full-size dialog over the page.
    expect(
      document.body.querySelector(".expanded__reference-preview"),
    ).toBeNull();
  });
});
