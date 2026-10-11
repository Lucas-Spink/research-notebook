import { describe, expect, it } from "vitest";
import { RIBBON_LAYOUT, RIBBON_TABS } from "./ribbonLayout";

/** The structure the maintainer agreed: four tabs, each command in one place. */
const AGREED = {
  home: {
    project: ["allProjects", "projectControls"],
    new: ["newQuestion", "newExperiment", "addResult"],
    selection: ["moveToBin", "details"],
    panes: ["sourcesPane", "binPane", "canvasNotesPane"],
  },
  view: {
    find: ["search", "filters", "sorting"],
    table: ["columns", "density", "expandAll", "collapseAll"],
    appearance: ["darkMode"],
  },
  sources: {
    library: ["refreshSources"],
    attach: ["attachSource"],
    citations: ["citationStyle"],
  },
  export: {
    documents: ["exportPdf", "exportHtml"],
    data: ["exportMachine"],
    packages: ["exportBundles", "exportGitBundle"],
    preserve: ["archiveProject"],
  },
  settings: {
    settings: ["settingsControls"],
    check: ["integrityCheck"],
  },
};

describe("the ribbon layout", () => {
  it("has Home, View, Sources, Export and Settings tabs, in that order", () => {
    expect(RIBBON_TABS).toEqual([
      "home",
      "view",
      "sources",
      "export",
      "settings",
    ]);
  });

  it("puts each command in the group the maintainer agreed", () => {
    const actual = Object.fromEntries(
      RIBBON_TABS.map((tab) => [
        tab,
        Object.fromEntries(
          RIBBON_LAYOUT[tab].map((g) => [g.group, [...g.commands]]),
        ),
      ]),
    );
    expect(actual).toEqual(AGREED);
  });

  it("lists every command exactly once across all tabs", () => {
    const all = RIBBON_TABS.flatMap((tab) =>
      RIBBON_LAYOUT[tab].flatMap((g) => g.commands),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("has no empty group and no group name used twice", () => {
    const groups = RIBBON_TABS.flatMap((tab) => RIBBON_LAYOUT[tab]);
    expect(groups.every((g) => g.commands.length > 0)).toBe(true);
    const names = groups.map((g) => g.group);
    expect(new Set(names).size).toBe(names.length);
  });
});
