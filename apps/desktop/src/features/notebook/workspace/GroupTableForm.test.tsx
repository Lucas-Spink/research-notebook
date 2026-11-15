import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupTableForm, groupChoices } from "./GroupTableForm";
import { canvasResultsMessages as m } from "./messages";

/** Making a canvas table from groups of one experiment's results (ADR-0071). */

const ID = (n: number) => `01JAXG00000000000000000G0${n}`;
type TestGroup = {
  id: string;
  name: string;
  items: string[];
  groups: TestGroup[];
};
const group = (
  n: number,
  name: string,
  items: number,
  groups: TestGroup[] = [],
): TestGroup => ({
  id: ID(n),
  name,
  items: Array.from(
    { length: items },
    (_, i) => `01JAXA00000000000000000A${n}${i}`,
  ),
  groups,
});

let mounted: { root: Root; place: HTMLDivElement } | null = null;
afterEach(() => {
  if (mounted === null) return;
  act(() => mounted?.root.unmount());
  mounted.place.remove();
  mounted = null;
});

function mount(element: React.ReactElement): HTMLDivElement {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const place = document.createElement("div");
  document.body.append(place);
  const root = createRoot(place);
  mounted = { root, place };
  act(() => root.render(element));
  return place;
}

const click = (element: Element | null | undefined) => {
  if (!element) throw new Error("nothing to click");
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};
const button = (place: ParentNode, label: string) => {
  const found = [...place.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
};
const labelled = (place: ParentNode, text: string) => {
  const found = [...place.querySelectorAll("label")].find((l) =>
    l.textContent.includes(text),
  );
  return found?.querySelector("input");
};

describe("groupChoices", () => {
  it("lists groups with results, parents first, indented by depth, skipping empty ones", () => {
    const tree = [
      group(1, "Control", 2, [group(2, "Replicate", 1), group(3, "Empty", 0)]),
      group(4, "Treated", 3),
    ];
    expect(groupChoices(tree)).toEqual([
      { id: ID(1), name: "Control", depth: 0, count: 2 },
      { id: ID(2), name: "Replicate", depth: 1, count: 1 },
      { id: ID(4), name: "Treated", depth: 0, count: 3 },
    ]);
  });
});

describe("GroupTableForm", () => {
  const choices = [
    { id: ID(1), name: "Control", depth: 0, count: 2 },
    { id: ID(2), name: "Treated", depth: 0, count: 3 },
  ];

  it("offers nothing when no group has results", () => {
    const place = mount(<GroupTableForm choices={[]} onMake={vi.fn()} />);
    expect(place.innerHTML).toBe("");
  });

  it("makes a table from the ticked groups, in list order, as columns", () => {
    const onMake = vi.fn();
    const place = mount(<GroupTableForm choices={choices} onMake={onMake} />);
    click(button(place, m.makeTable));
    expect(button(place, m.makeTableCreate).disabled).toBe(true);
    click(labelled(place, "Treated"));
    click(labelled(place, "Control"));
    click(labelled(place, m.makeTableColumn));
    click(button(place, m.makeTableCreate));
    expect(onMake).toHaveBeenCalledWith([ID(1), ID(2)], "column");
  });

  it("makes rows by default and can be cancelled", () => {
    const onMake = vi.fn();
    const place = mount(<GroupTableForm choices={choices} onMake={onMake} />);
    click(button(place, m.makeTable));
    click(labelled(place, "Control"));
    click(button(place, m.makeTableCreate));
    expect(onMake).toHaveBeenCalledWith([ID(1)], "row");
    click(button(place, m.makeTable));
    click(button(place, m.makeTableCancel));
    expect(button(place, m.makeTable)).toBeDefined();
  });
});
