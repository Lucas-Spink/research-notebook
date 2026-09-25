import type {
  ArtefactsFileModel,
  SummaryPart,
} from "@research-notebook/format";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sampleNotebook } from "../model/fakeApi";
import { ColumnsMenu } from "./ColumnsMenu";
import { columnLayout } from "./model/columns";
import type { HeaderRow } from "./model/rows";
import { EmptyRowView, QuestionHeaderRowView, SummaryCell } from "./TableRows";

function html(node: React.ReactElement): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(node);
  return container;
}

const place = { index: 2, style: { height: 64 } };

const header: HeaderRow = {
  kind: "header",
  key: "question:Q-001.md",
  questionId: "01JAXQ",
  ref: "Q-001",
  title: "Batch effects?",
  motivation: "Why do batch effects matter?",
  shown: 1,
  total: 2,
  filtered: true,
  collapsed: false,
  readOnly: false,
};

function headerView(row: HeaderRow, motivationWidth: number | null = 220) {
  return html(
    <QuestionHeaderRowView
      row={row}
      place={place}
      columnCount={6}
      motivationWidth={motivationWidth}
      selected={false}
      sharesRef={false}
      onToggle={() => undefined}
      onSelect={() => undefined}
    />,
  );
}

describe("QuestionHeaderRowView", () => {
  it("says n of m while a filter is in force, and just the count otherwise (FR-TBL-03)", () => {
    expect(headerView(header).textContent).toContain("1 of 2 experiments");
    const plain = { ...header, filtered: false, shown: 2 };
    expect(headerView(plain).textContent).toContain("2 experiments");
    expect(headerView(plain).textContent).not.toContain(" of ");
    expect(headerView({ ...plain, total: 1, shown: 1 }).textContent).toContain(
      "1 experiment",
    );
  });

  it("shows the Motivation summary, limited to the width of its column", () => {
    const summary = headerView(header, 220).querySelector<HTMLElement>(
      ".wtable__motivation",
    );
    expect(summary?.textContent).toBe("Why do batch effects matter?");
    expect(summary?.style.maxWidth).toBe("220px");
  });

  it("leaves the Motivation out when its column is hidden", () => {
    expect(
      headerView(header, null).querySelector(".wtable__motivation"),
    ).toBeNull();
  });

  it("marks a question that is read-only because another file has its ID", () => {
    expect(headerView({ ...header, readOnly: true }).textContent).toContain(
      "Read-only",
    );
  });

  it("names Unassigned, which has no question to select", () => {
    const unassigned = {
      ...header,
      questionId: null,
      ref: null,
      title: "",
      motivation: "",
      key: "unassigned",
    };
    const view = headerView(unassigned);
    expect(view.textContent).toContain("Unassigned");
    expect(view.querySelector(".wtable__select")).toBeNull();
    expect(
      view.querySelector("button[aria-expanded]")?.getAttribute("aria-label"),
    ).toBe("Collapse Unassigned");
  });
});

describe("EmptyRowView", () => {
  it("tells the person why a question shows no experiments", () => {
    expect(html(<EmptyRowView place={place} />).textContent).toContain(
      "No experiments in this question match the filter.",
    );
  });
});

describe("ColumnsMenu", () => {
  const { state } = sampleNotebook();
  const layout = columnLayout({
    ...state.project.table,
    columns: state.project.table.columns.map((c) =>
      c.key === "literature" ? { ...c, hidden: true } : c,
    ),
  });

  function menu(writable: boolean) {
    return html(
      <ColumnsMenu
        layout={layout}
        writable={writable}
        onHide={() => undefined}
        onWidth={() => undefined}
        onReset={() => undefined}
      />,
    );
  }

  it("lists every column with a show control and a width, each named", () => {
    const view = menu(true);
    const items = [...view.querySelectorAll("li")];
    expect(items).toHaveLength(6);
    expect(items[1]?.textContent).toContain("Show Methods");
    const checks = items.map(
      (li) =>
        li.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked,
    );
    expect(checks).toEqual([true, true, true, true, true, false]);
    const width = view.querySelector<HTMLInputElement>('input[type="number"]');
    expect(width?.value).toBe("220");
    expect(view.textContent).toContain("Width of Motivation (pixels)");
  });

  it("gives every field a label", () => {
    const view = menu(true);
    for (const field of view.querySelectorAll("input")) {
      const id = field.getAttribute("id");
      const wrapped = field.closest("label") !== null;
      expect(
        wrapped ||
          (id !== null && view.querySelector(`label[for="${id}"]`) !== null),
      ).toBe(true);
    }
  });

  it("says a read-only project keeps column changes for the session only", () => {
    expect(menu(false).textContent).toContain("only until it is closed");
    expect(menu(true).textContent).not.toContain("only until it is closed");
  });

  it("offers to reset the columns", () => {
    const buttons = [...menu(true).querySelectorAll("button")].map(
      (b) => b.textContent,
    );
    expect(buttons).toEqual(["Reset columns"]);
  });
});

/** FR-TBL-05, FR-EDT-06: a cell's summary shows an artefact reference as a
 * static chip, resolved against the experiment's artefacts.yaml, with no
 * editor instance and nothing to click. */
describe("SummaryCell", () => {
  const text = (value: string): SummaryPart => ({ kind: "text", text: value });
  const ref = (
    label: string,
    ulid: string | null = "01JB0000000000000000000001",
    version: number | null = 2,
  ): SummaryPart => ({ kind: "ref", label, ulid, version });

  const artefacts: ArtefactsFileModel = {
    format_version: 1,
    groups: [],
    artefacts: [
      {
        id: "01JB0000000000000000000001",
        name: "PCA by treatment (current)",
        role: "result",
        mode: "copy",
        type: "pdf",
        source: { root: "project", path: "scripts/pca.R" },
        created: "2026-01-01T00:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/pca.v1.pdf",
            sha256: "a".repeat(64),
            size: 10,
            captured: "2026-01-01T00:00:00Z",
          },
          {
            v: 2,
            file: "evidence/pca.v2.pdf",
            sha256: "b".repeat(64),
            size: 20,
            captured: "2026-01-02T00:00:00Z",
          },
        ],
      },
    ],
  };

  function cell(
    parts: readonly SummaryPart[],
    file: ArtefactsFileModel | null,
  ) {
    return html(<SummaryCell parts={parts} artefacts={file} />);
  }

  it("shows an em dash for an empty summary", () => {
    const view = cell([], artefacts);
    expect(view.querySelector(".wtable__empty")).not.toBeNull();
  });

  it("shows a pending reference's last known label plainly, before artefacts.yaml has loaded", () => {
    const view = cell([text("See "), ref("Loading name"), text(".")], null);
    const chip = view.querySelector(".wtable__chip");
    expect(chip?.textContent).toBe("Loading name");
  });

  it("shows a resolved reference's current name, not its stored label", () => {
    const view = cell([ref("Old label")], artefacts);
    const chip = view.querySelector(".wtable__chip");
    expect(chip?.textContent).toBe("PCA by treatment (current)");
  });

  it("marks a reference pinned to an older version as having a newer one", () => {
    const view = cell(
      [ref("PCA by treatment", "01JB0000000000000000000001", 1)],
      artefacts,
    );
    expect(view.querySelector(".wtable__chip")?.textContent).toContain(
      "Newer version available",
    );
  });

  it("does not mark a reference already at the latest version", () => {
    const view = cell(
      [ref("PCA by treatment", "01JB0000000000000000000001", 2)],
      artefacts,
    );
    expect(view.querySelector(".wtable__chip")?.textContent).not.toContain(
      "Newer version available",
    );
  });

  it("marks a reference to an artefact no longer in artefacts.yaml as detached", () => {
    const view = cell(
      [ref("Removed artefact", "01JB0000000000000000000099")],
      artefacts,
    );
    const chip = view.querySelector(".wtable__chip--detached");
    expect(chip?.textContent).toContain("Removed artefact");
    expect(chip?.textContent).toContain("Artefact removed");
  });

  it("marks a reference whose title held no valid ULID as detached too", () => {
    const view = cell([ref("Odd", null, null)], artefacts);
    expect(view.querySelector(".wtable__chip--detached")).not.toBeNull();
  });

  it("never makes a chip focusable or clickable: the table holds no live editor", () => {
    const view = cell([ref("PCA by treatment")], artefacts);
    const chip = view.querySelector(".wtable__chip");
    expect(chip?.getAttribute("role")).toBeNull();
    expect(chip?.getAttribute("tabindex")).toBeNull();
    expect(chip?.tagName).not.toBe("BUTTON");
  });

  it("mixes plain text and chips in one cell, in order", () => {
    const view = cell(
      [text("See "), ref("PCA by treatment"), text(" for detail.")],
      artefacts,
    );
    expect(view.querySelector(".wtable__clamp")?.textContent).toBe(
      "See PCA by treatment (current) for detail.",
    );
  });
});
