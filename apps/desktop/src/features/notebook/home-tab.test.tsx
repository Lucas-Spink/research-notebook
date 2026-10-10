import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { sampleNotebook } from "./model/fakeApi";
import { testModel } from "./model/testModel";
import { NotebookView } from "./NotebookView";
import { prepareInteractiveTable } from "./table/tableTesting";

/** Issue #101: a way back to the start page from the Home tab, and a save indicator that does not move the table. */

const { state } = sampleNotebook();
prepareInteractiveTable();

function mount(props: {
  onCloseProject?: () => void;
  busy?: boolean;
}): HTMLElement {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const place = document.createElement("div");
  document.body.append(place);
  const notebook = testModel(
    state,
    props.busy === undefined ? {} : { busy: props.busy },
  );
  act(() => {
    createRoot(place).render(
      <NotebookView
        notebook={notebook}
        folder={1}
        {...(props.onCloseProject === undefined
          ? {}
          : { onCloseProject: props.onCloseProject })}
      />,
    );
  });
  return place;
}

const homeButton = (view: HTMLElement) =>
  [...view.querySelectorAll('[role="toolbar"] button')].find(
    (b) => b.textContent === "‹ All projects",
  );

describe("the Home tab's way back to the start page", () => {
  it("offers All projects, which closes the project", () => {
    const close = vi.fn();
    const view = mount({ onCloseProject: close });
    const button = homeButton(view);
    if (!(button instanceof HTMLElement)) throw new Error("no button");
    act(() => button.click());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("offers nothing when the window cannot close the project", () => {
    expect(homeButton(mount({}))).toBeUndefined();
  });
});

describe("the save indicator", () => {
  it("floats over the page instead of taking a line above the table", () => {
    const view = mount({ busy: true });
    const working = view.querySelector(".notebook__working");
    expect(working?.textContent).toContain("Working");
    expect(mount({}).querySelector(".notebook__working")).toBeNull();
  });
});
