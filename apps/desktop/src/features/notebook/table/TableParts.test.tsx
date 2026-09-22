import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sampleNotebook } from "../model/fakeApi";
import { ColumnsMenu } from "./ColumnsMenu";
import { columnLayout } from "./model/columns";
import type { HeaderRow } from "./model/rows";
import { EmptyRowView, QuestionHeaderRowView } from "./TableRows";

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
