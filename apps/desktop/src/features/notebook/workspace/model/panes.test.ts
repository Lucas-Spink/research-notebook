import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANE_WIDTH,
  MAX_PANE_WIDTH,
  MIN_PANE_WIDTH,
  clampPaneWidth,
  initialPanes,
  panesReducer,
  resultTabId,
  type PaneAction,
  type PaneState,
  type PaneTab,
} from "./panes";

const sources: PaneTab = { id: "sources", kind: "sources" };
const details: PaneTab = { id: "details", kind: "details" };
const figure = (artefactId: string): PaneTab => ({
  id: resultTabId("EXP-001", artefactId),
  kind: "result",
  experimentFolder: "EXP-001",
  artefactId,
  version: null,
});

const run = (actions: PaneAction[], from: PaneState = initialPanes) =>
  actions.reduce(panesReducer, from);

describe("panesReducer", () => {
  it("starts closed, with no tabs", () => {
    expect(initialPanes.tabs).toEqual([]);
    expect(initialPanes.activeId).toBeNull();
  });

  it("opens a tab and makes it the active one", () => {
    const state = run([{ type: "open", tab: sources }]);
    expect(state.tabs).toEqual([sources]);
    expect(state.activeId).toBe("sources");
  });

  it("shows a tab again instead of adding a second one", () => {
    const state = run([
      { type: "open", tab: figure("A") },
      { type: "open", tab: sources },
      { type: "open", tab: figure("A") },
    ]);
    expect(state.tabs.map((t) => t.id)).toEqual([figure("A").id, "sources"]);
    expect(state.activeId).toBe(figure("A").id);
  });

  it("activates only a tab that exists", () => {
    const open = run([{ type: "open", tab: sources }]);
    expect(panesReducer(open, { type: "activate", id: "nope" })).toBe(open);
    const two = run([{ type: "open", tab: details }], open);
    expect(
      panesReducer(two, { type: "activate", id: "sources" }).activeId,
    ).toBe("sources");
  });

  it("closing the active tab activates its neighbour, then closes the pane after the last", () => {
    const three = run([
      { type: "open", tab: sources },
      { type: "open", tab: details },
      { type: "open", tab: figure("A") },
      { type: "activate", id: "details" },
    ]);
    const afterMiddle = panesReducer(three, { type: "close", id: "details" });
    expect(afterMiddle.activeId).toBe(figure("A").id);
    const afterLast = run(
      [
        { type: "close", id: figure("A").id },
        { type: "close", id: "sources" },
      ],
      afterMiddle,
    );
    expect(afterLast.tabs).toEqual([]);
    expect(afterLast.activeId).toBeNull();
  });

  it("closing a tab that is not active keeps the active one", () => {
    const state = run([
      { type: "open", tab: sources },
      { type: "open", tab: details },
      { type: "close", id: "sources" },
    ]);
    expect(state.activeId).toBe("details");
  });

  it("closes every tab at once, keeping the width", () => {
    const state = run([
      { type: "open", tab: sources },
      { type: "resize", width: 600 },
      { type: "closeAll" },
    ]);
    expect(state.tabs).toEqual([]);
    expect(state.width).toBe(600);
  });

  it("keeps the width inside the limits", () => {
    expect(run([{ type: "resize", width: 10 }]).width).toBe(MIN_PANE_WIDTH);
    expect(run([{ type: "resize", width: 99_999 }]).width).toBe(MAX_PANE_WIDTH);
    expect(run([{ type: "resize", width: 512.4 }]).width).toBe(512);
    expect(clampPaneWidth(Number.NaN)).toBe(DEFAULT_PANE_WIDTH);
  });

  it("never takes more than the window can spare, but never less than the minimum", () => {
    expect(clampPaneWidth(900, 600)).toBe(600);
    expect(clampPaneWidth(900, 100)).toBe(MIN_PANE_WIDTH);
  });

  it("minimises to a rail without closing any tab, and restores on opening one", () => {
    const open = run([
      { type: "open", tab: sources },
      { type: "open", tab: details },
      { type: "open", tab: figure("A") },
    ]);
    const folded = panesReducer(open, { type: "minimise" });
    expect(folded.minimised).toBe(true);
    expect(folded.tabs).toEqual(open.tabs);
    expect(folded.activeId).toBe(open.activeId);

    // Choosing a tab from the rail shows it, and unfolds the pane.
    const picked = panesReducer(folded, { type: "activate", id: "sources" });
    expect(picked.minimised).toBe(false);
    expect(picked.activeId).toBe("sources");

    // So does opening something, and the restore action.
    expect(panesReducer(folded, { type: "open", tab: details }).minimised).toBe(
      false,
    );
    expect(panesReducer(folded, { type: "restore" }).minimised).toBe(false);
  });

  it("has nothing to minimise without tabs, and unfolds when the last tab closes", () => {
    expect(panesReducer(initialPanes, { type: "minimise" })).toBe(initialPanes);
    const folded = panesReducer(run([{ type: "open", tab: sources }]), {
      type: "minimise",
    });
    expect(
      panesReducer(folded, { type: "close", id: "sources" }).minimised,
    ).toBe(false);
    expect(panesReducer(folded, { type: "closeAll" }).minimised).toBe(false);
  });
});
