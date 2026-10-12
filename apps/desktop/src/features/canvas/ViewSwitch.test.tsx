import { afterEach, describe, expect, it, vi } from "vitest";
import { buttonNamed, click, mount, unmount } from "./testSupport";
import { ViewSwitch } from "./ViewSwitch";

afterEach(unmount);

describe("ViewSwitch", () => {
  it("offers Table and Canvas and marks the one showing", () => {
    const view = mount(<ViewSwitch mode="table" onChange={() => undefined} />);
    expect(
      view.querySelector('[role="group"]')?.getAttribute("aria-label"),
    ).toBe("View");
    expect(buttonNamed(view, "Table").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(buttonNamed(view, "Canvas").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("asks for the other view when it is chosen", () => {
    const onChange = vi.fn();
    const view = mount(<ViewSwitch mode="table" onChange={onChange} />);
    click(buttonNamed(view, "Canvas"));
    expect(onChange).toHaveBeenCalledWith("canvas");
  });

  it("does nothing when the view already showing is chosen", () => {
    const onChange = vi.fn();
    const view = mount(<ViewSwitch mode="canvas" onChange={onChange} />);
    click(buttonNamed(view, "Canvas"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("can turn off one view and leave the other, such as the canvas while it is in its own window", () => {
    const onChange = vi.fn();
    const view = mount(
      <ViewSwitch mode="table" unavailable={["canvas"]} onChange={onChange} />,
    );
    expect(buttonNamed(view, "Canvas").disabled).toBe(true);
    expect(buttonNamed(view, "Table").disabled).toBe(false);
    click(buttonNamed(view, "Canvas"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("can be turned off", () => {
    const view = mount(
      <ViewSwitch mode="table" disabled onChange={() => undefined} />,
    );
    expect(buttonNamed(view, "Canvas").disabled).toBe(true);
  });
});
