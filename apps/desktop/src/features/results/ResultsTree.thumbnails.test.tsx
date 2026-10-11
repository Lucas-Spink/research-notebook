import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ids, sampleArtefacts } from "./model/sample";
import { ResultsTree } from "./ResultsTree";

/** A tree can show a picture beside each result, for scanning figures; folders have none. */

let root: Root | null = null;
let place: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  place?.remove();
  root = null;
  place = null;
});

function mount(renderThumbnail?: (artefactId: string) => React.ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  place = document.createElement("div");
  document.body.append(place);
  root = createRoot(place);
  act(() =>
    root?.render(
      <ResultsTree
        file={sampleArtefacts()}
        disabled={false}
        onAction={() => Promise.resolve({ ok: true })}
        {...(renderThumbnail === undefined ? {} : { renderThumbnail })}
      />,
    ),
  );
  return place;
}

const rowNamed = (view: HTMLElement, name: string): HTMLElement => {
  const found = [
    ...view.querySelectorAll<HTMLElement>('[role="treeitem"]'),
  ].find((r) => r.querySelector(".results__name-text")?.textContent === name);
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
};

describe("result thumbnails in the tree", () => {
  it("draws what it is given beside each result, before its name", () => {
    const asked: string[] = [];
    const view = mount((id) => {
      asked.push(id);
      return <img alt={`picture ${id}`} />;
    });
    const row = rowNamed(view, "Counts");
    const thumb = row.querySelector(".results__thumb");
    expect(thumb?.querySelector("img")?.getAttribute("alt")).toBe(
      `picture ${ids.r(3)}`,
    );
    const children = [...row.children];
    expect(children.indexOf(thumb as Element)).toBeLessThan(
      children.indexOf(row.querySelector(".results__name-text") as Element),
    );
    expect(asked).toContain(ids.r(3));
  });

  it("draws none for a folder", () => {
    const view = mount(() => <img alt="x" />);
    expect(
      rowNamed(view, "Figures").querySelector(".results__thumb"),
    ).toBeNull();
    expect(
      rowNamed(view, "Tables").querySelector(".results__thumb"),
    ).toBeNull();
  });

  it("draws none unless asked, so the other trees are unchanged", () => {
    const view = mount();
    expect(view.querySelector(".results__thumb")).toBeNull();
  });

  it("marks a row that has a picture, so it can be made taller", () => {
    const view = mount(() => <img alt="x" />);
    expect(
      rowNamed(view, "Counts").classList.contains("results__row--with-thumb"),
    ).toBe(true);
    expect(
      rowNamed(view, "Figures").classList.contains("results__row--with-thumb"),
    ).toBe(false);
  });
});
