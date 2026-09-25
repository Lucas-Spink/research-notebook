import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtefactRefChip } from "./ArtefactRefChip";
import type { ResolvedReference } from "./model/artefactReference";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function mount(resolved: ResolvedReference, onActivate = () => undefined) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ArtefactRefChip resolved={resolved} onActivate={onActivate} />,
    ),
  );
  return container;
}

const RESOLVED_COPY: ResolvedReference = {
  status: "resolved",
  artefact: {
    id: "01JB0000000000000000000001",
    name: "PCA by treatment",
    role: "result",
    mode: "copy",
    type: "pdf",
    source: { root: "project", path: "scripts/pca.R" },
    created: "2026-01-01T00:00:00Z",
    versions: [
      {
        v: 2,
        file: "evidence/pca.v2.pdf",
        sha256: "b".repeat(64),
        size: 20,
        captured: "2026-01-02T00:00:00Z",
      },
    ],
  },
  label: "PCA by treatment",
  fileName: "pca.v2.pdf",
  version: 2,
};

const RESOLVED_LINK: ResolvedReference = {
  status: "resolved",
  artefact: {
    id: "01JB0000000000000000000002",
    name: "Raw counts",
    role: "result",
    mode: "link",
    type: "table",
    source: { root: "project", path: "data/counts.h5" },
    created: "2026-01-01T00:00:00Z",
    link: {
      sha256: "c".repeat(64),
      size: 100,
      observed_mtime: "2026-01-01T00:00:00Z",
      checked: "2026-01-01T00:00:00Z",
    },
  },
  label: "Raw counts",
  fileName: "counts.h5",
  version: null,
};

describe("ArtefactRefChip", () => {
  it("shows the label plainly, not interactively, while pending", () => {
    const view = mount({ status: "pending", label: "Old name" });
    expect(view.textContent).toBe("Old name");
    expect(view.querySelector('[role="button"]')).toBeNull();
  });

  it("shows the last known label plainly, not interactively, when detached", () => {
    const view = mount({ status: "detached", label: "Removed artefact" });
    expect(view.textContent).toBe("Removed artefact");
    expect(view.querySelector('[role="button"]')).toBeNull();
  });

  it("shows the artefact's current display name when resolved", () => {
    const view = mount(RESOLVED_COPY);
    const chip = view.querySelector('[role="button"]');
    expect(chip?.textContent).toContain("PCA by treatment");
  });

  it("shows the filename and pinned version on hover", () => {
    const view = mount(RESOLVED_COPY);
    const chip = view.querySelector('[role="button"]');
    act(() => {
      chip?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(view.querySelector('[role="tooltip"]')?.textContent).toContain(
      "pca.v2.pdf",
    );
    expect(view.querySelector('[role="tooltip"]')?.textContent).toContain("v2");
  });

  it("shows the filename, with no version, for a link-mode artefact", () => {
    const view = mount(RESOLVED_LINK);
    const chip = view.querySelector('[role="button"]');
    act(() => {
      chip?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(view.querySelector('[role="tooltip"]')?.textContent).toBe(
      "counts.h5",
    );
  });

  it("shows the detail on focus too, and hides it on blur", () => {
    const view = mount(RESOLVED_COPY);
    const chip = view.querySelector('[role="button"]');
    act(() => {
      chip?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(view.querySelector('[role="tooltip"]')).not.toBeNull();
    act(() => {
      chip?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(view.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("activates on click", () => {
    const onActivate = vi.fn();
    const view = mount(RESOLVED_COPY, onActivate);
    const chip = view.querySelector('[role="button"]');
    act(() => {
      chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("activates on Enter and Space", () => {
    const onActivate = vi.fn();
    const view = mount(RESOLVED_COPY, onActivate);
    const chip = view.querySelector('[role="button"]');
    for (const key of ["Enter", " "]) {
      act(() => {
        chip?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
    }
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("is focusable when resolved", () => {
    const view = mount(RESOLVED_COPY);
    expect(
      view.querySelector('[role="button"]')?.getAttribute("tabindex"),
    ).toBe("0");
  });
});
