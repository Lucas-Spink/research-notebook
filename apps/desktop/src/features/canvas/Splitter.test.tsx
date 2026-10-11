import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Splitter } from "./Splitter";
import { mount, unmount } from "./testSupport";

afterEach(unmount);

function setup(direction: 1 | -1 = 1) {
  const onResize = vi.fn();
  const onNudge = vi.fn();
  const view = mount(
    <Splitter
      label="Resize the results panel"
      value={260}
      min={160}
      max={480}
      direction={direction}
      onResize={onResize}
      onNudge={onNudge}
    />,
  );
  const handle = view.querySelector('[role="separator"]');
  if (!(handle instanceof HTMLElement)) throw new Error("no separator");
  const press = (key: string, shiftKey = false) =>
    act(() => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }),
      );
    });
  return { handle, press, onResize, onNudge };
}

describe("Splitter", () => {
  it("is a labelled vertical separator reporting the width it controls", () => {
    const { handle } = setup();
    expect(handle.getAttribute("aria-label")).toBe("Resize the results panel");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe("260");
    expect(handle.getAttribute("aria-valuemin")).toBe("160");
    expect(handle.getAttribute("aria-valuemax")).toBe("480");
    expect(handle.tabIndex).toBe(0);
  });

  it("grows a panel on its right edge with the right arrow, in steps of 16, or 64 with Shift", () => {
    const { press, onNudge } = setup(1);
    press("ArrowRight");
    press("ArrowLeft");
    press("ArrowRight", true);
    expect(onNudge.mock.calls).toEqual([[16], [-16], [64]]);
  });

  it("works the other way round for a panel on the right of the canvas", () => {
    const { press, onNudge } = setup(-1);
    press("ArrowRight");
    press("ArrowLeft");
    expect(onNudge.mock.calls).toEqual([[-16], [16]]);
  });

  it("goes to the limits with Home and End", () => {
    const { press, onResize } = setup();
    press("Home");
    press("End");
    expect(onResize.mock.calls).toEqual([[160], [480]]);
  });

  it("ignores other keys, leaving them for the page", () => {
    const { press, onNudge, onResize } = setup();
    press("a");
    expect(onNudge).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
  });
});
