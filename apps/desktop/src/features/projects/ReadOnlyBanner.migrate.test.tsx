import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadOnlyBanner } from "./ReadOnlyBanner";

/** Spec 5.13 rule 4: an older project is updated only after the person has confirmed. */

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function show(onMigrate: () => void) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ReadOnlyBanner
        reason={{ kind: "olderFormat" }}
        busy={false}
        onTakeOver={() => undefined}
        onRetry={() => undefined}
        onMigrate={onMigrate}
      />,
    ),
  );
  return container;
}

const button = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent === label);

describe("ReadOnlyBanner for an older project", () => {
  it("does not update on the first click; it explains and asks", () => {
    const onMigrate = vi.fn();
    const c = show(onMigrate);
    act(() => button(c, "Update project…")?.click());
    expect(onMigrate).not.toHaveBeenCalled();
    expect(c.textContent).toMatch(/backup/i);
    expect(button(c, "Update project")).toBeDefined();
    expect(button(c, "Cancel")).toBeDefined();
  });

  it("updates only when the person confirms", () => {
    const onMigrate = vi.fn();
    const c = show(onMigrate);
    act(() => button(c, "Update project…")?.click());
    act(() => button(c, "Update project")?.click());
    expect(onMigrate).toHaveBeenCalledTimes(1);
  });

  it("goes back without updating when the person cancels", () => {
    const onMigrate = vi.fn();
    const c = show(onMigrate);
    act(() => button(c, "Update project…")?.click());
    act(() => button(c, "Cancel")?.click());
    expect(onMigrate).not.toHaveBeenCalled();
    expect(button(c, "Update project…")).toBeDefined();
  });
});
