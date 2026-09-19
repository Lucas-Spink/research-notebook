import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConflictView } from "./ConflictView";
import type { Theirs } from "./model/tracker";

const PATH = "_notebook/questions/Q-01.md";

function render(mine: string, theirs: Theirs): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <ConflictView
      path={PATH}
      mine={mine}
      theirs={theirs}
      onKeepMine={() => undefined}
      onUseTheirs={() => undefined}
    />,
  );
  return container;
}

const buttons = (container: HTMLElement) => [
  ...container.querySelectorAll("button"),
];

const present: Theirs = { kind: "present", text: "their text", sha256: "h1" };

describe("ConflictView", () => {
  it("is announced, names the file and explains what happened", () => {
    const container = render("my text", present);
    const region = container.querySelector('[role="alert"]');
    expect(region).not.toBeNull();
    expect(region?.textContent).toContain(PATH);
    expect(region?.textContent).toMatch(/changed outside the application/);
    expect(region?.getAttribute("aria-labelledby")).not.toBeNull();
  });

  it("shows both versions side by side, each labelled", () => {
    const container = render("my text", present);
    const headings = [...container.querySelectorAll("h4")].map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(["Your unsaved version", "Version on disk"]);
    const texts = [...container.querySelectorAll("pre")].map(
      (p) => p.textContent,
    );
    expect(texts).toEqual(["my text", "their text"]);
  });

  it("offers the two choices, each saying what it does", () => {
    const container = render("my text", present);
    expect(buttons(container).map((b) => b.textContent)).toEqual([
      "Keep my version",
      "Use the version on disk",
    ]);
    expect(container.textContent).toMatch(/replaces the version on disk/);
    expect(container.textContent).toMatch(/unsaved changes are discarded/);
    expect(buttons(container).every((b) => !b.disabled)).toBe(true);
  });

  it("cannot be resolved while the version on disk is still being read", () => {
    const container = render("my text", { kind: "loading" });
    expect(container.textContent).toMatch(/Reading the version on disk/);
    expect(buttons(container).every((b) => b.disabled)).toBe(true);
  });

  it("says when the file was removed, and offers to accept that", () => {
    const container = render("my text", { kind: "missing" });
    expect(container.textContent).toMatch(/removed from disk/);
    expect(buttons(container).map((b) => b.textContent)).toEqual([
      "Keep my version",
      "Accept the removal",
    ]);
    expect(buttons(container).every((b) => !b.disabled)).toBe(true);
  });

  it("shows text as text, never as markup", () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const container = render(hostile, {
      kind: "present",
      text: hostile,
      sha256: "h1",
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelectorAll("pre")[0]?.textContent).toBe(hostile);
  });

  it("says so when a version is empty", () => {
    const container = render("", { kind: "present", text: "", sha256: "h1" });
    const texts = [...container.querySelectorAll("pre")].map(
      (p) => p.textContent,
    );
    expect(texts).toEqual(["(empty)", "(empty)"]);
  });
});
