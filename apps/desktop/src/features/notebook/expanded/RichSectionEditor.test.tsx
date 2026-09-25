import type { ArtefactsFileModel } from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutosaveField } from "./model/useAutosave";
import { RichSectionEditor } from "./RichSectionEditor";

const ULID = "01JB0000000000000000000001";

function artefactsFile(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: ULID,
        name: "PCA by treatment",
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
        ],
      },
    ],
    groups: [],
  };
}

const REFERENCE = `[Stale label](evidence/pca.v1.pdf "art:${ULID} v1")`;

const ULID2 = "01JB0000000000000000000002";

/** Two copy-mode artefacts, each with a newer version than `REFERENCE` and
 * `TWO_REFERENCES` below are pinned to (FR-EDT-07). */
function artefactsFileOutdated(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: ULID,
        name: "PCA by treatment",
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
      {
        id: ULID2,
        name: "Raw counts",
        role: "result",
        mode: "copy",
        type: "table",
        source: { root: "project", path: "scripts/counts.R" },
        created: "2026-01-01T00:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/counts.v1.csv",
            sha256: "c".repeat(64),
            size: 10,
            captured: "2026-01-01T00:00:00Z",
          },
          {
            v: 2,
            file: "evidence/counts.v2.csv",
            sha256: "d".repeat(64),
            size: 20,
            captured: "2026-01-02T00:00:00Z",
          },
        ],
      },
    ],
    groups: [],
  };
}

const TWO_REFERENCES = `[Stale PCA](evidence/pca.v1.pdf "art:${ULID} v1") and [Stale counts](evidence/counts.v1.csv "art:${ULID2} v1")`;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function field(overrides: Partial<AutosaveField> = {}): AutosaveField {
  return {
    text: "PCA on normalised counts.",
    status: "saved",
    message: null,
    onChange: () => undefined,
    onBlur: () => undefined,
    ...overrides,
  };
}

function mount(
  props: Partial<React.ComponentProps<typeof RichSectionEditor>> = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <RichSectionEditor
        label="Methods"
        editorKey="EXP-001:methods"
        initialMarkdown="PCA on normalised counts."
        field={field()}
        disabled={false}
        live={true}
        onActivate={() => undefined}
        artefacts={null}
        onActivateReference={() => undefined}
        {...props}
      />,
    ),
  );
  return container;
}

describe("RichSectionEditor — live", () => {
  it("labels the field and shows the Saved, Saving, Unsaved or Error status", () => {
    const view = mount();
    const id = view.querySelector(".ProseMirror")?.getAttribute("id") ?? "";
    expect(view.querySelector(`label[for="${id}"]`)?.textContent).toBe(
      "Methods",
    );
    expect(view.querySelector('[role="status"]')?.textContent).toBe("Saved");
  });

  it("loads the stored Markdown, formatted, into the live editor", () => {
    const view = mount({ initialMarkdown: "This is **bold** text." });
    const pm = view.querySelector(".ProseMirror");
    expect(pm?.querySelector("strong")?.textContent).toBe("bold");
  });

  it("mounts exactly one editor instance", () => {
    const view = mount();
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
  });

  it("wires the editor's update event to onChange with the document serialised through packages/format", () => {
    // jsdom cannot simulate real contentEditable typing (a known limitation
    // shared by every ProseMirror-based editor's tests), so this dispatches
    // an input event without changing the DOM: ProseMirror re-syncs to its
    // own state and reports it, which is enough to prove `onUpdate` is
    // wired to `field.onChange(serialiseSectionMarkdown(...))` rather than
    // never called at all. The serialise/parse behaviour itself is
    // exhaustively covered in packages/format.
    const onChange = vi.fn();
    const view = mount({ field: field({ onChange }) });
    const pm = view.querySelector(".ProseMirror");
    if (pm === null) throw new Error("no editor");
    act(() => {
      pm.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("PCA on normalised counts.");
  });

  it("rewrites a stale reference label to its artefact's current name on every save, automatically (FR-EDT-09)", async () => {
    const onChange = vi.fn();
    const view = mount({
      initialMarkdown: REFERENCE,
      artefacts: artefactsFile(),
      field: field({ onChange }),
    });
    await act(() => Promise.resolve());
    const pm = view.querySelector(".ProseMirror");
    if (pm === null) throw new Error("no editor");
    act(() => {
      pm.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(
      `[PCA by treatment](evidence/pca.v1.pdf "art:${ULID} v1")`,
    );
  });

  it("disables the editor when asked, e.g. a read-only project", () => {
    const view = mount({ disabled: true });
    expect(
      view.querySelector(".ProseMirror")?.getAttribute("contenteditable"),
    ).toBe("false");
  });

  it("renders a resolved reference as a chip and activates it with its ULID and pinned version (FR-EDT-06)", async () => {
    const onActivateReference = vi.fn();
    const view = mount({
      initialMarkdown: REFERENCE,
      artefacts: artefactsFile(),
      onActivateReference,
    });
    // The NodeView's own portal settles on the next tick, after `useEditor`'s
    // initial content has built ProseMirror's node views.
    await act(() => Promise.resolve());
    const chip = view.querySelector(".expanded__artefact-ref--chip");
    expect(chip?.textContent).toBe("PCA by treatment");
    act(() => {
      chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onActivateReference).toHaveBeenCalledWith(ULID, 1);
  });

  it("updates a single outdated reference to its artefact's latest version and autosaves the result (FR-EDT-07)", async () => {
    const onChange = vi.fn();
    const view = mount({
      initialMarkdown: REFERENCE,
      artefacts: artefactsFileOutdated(),
      field: field({ onChange }),
    });
    await act(() => Promise.resolve());
    expect(view.textContent).toContain("Newer version available");
    const updateButton = view.querySelector(".expanded__artefact-ref-update");
    expect(updateButton?.textContent).toBe("Update");
    act(() => {
      updateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(
      `[PCA by treatment](evidence/pca.v2.pdf "art:${ULID} v2")`,
    );
    // The NodeView's own portal settles on the next tick, same as on mount.
    await act(() => Promise.resolve());
    expect(view.querySelector(".expanded__artefact-ref-newer")).toBeNull();
  });

  it("shows an 'Update all in section' button when any reference is outdated, and updates every outdated reference in one action (FR-EDT-07)", async () => {
    const onChange = vi.fn();
    const view = mount({
      initialMarkdown: TWO_REFERENCES,
      artefacts: artefactsFileOutdated(),
      field: field({ onChange }),
    });
    await act(() => Promise.resolve());
    const updateAll = view.querySelector(".expanded__update-all");
    expect(updateAll?.textContent).toBe("Update all in section");
    act(() => {
      updateAll?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const savedText = onChange.mock.calls.at(-1)?.[0] as string;
    expect(savedText).toContain(`art:${ULID} v2`);
    expect(savedText).toContain(`art:${ULID2} v2`);
    expect(view.querySelector(".expanded__update-all")).toBeNull();
    // The NodeViews' own portals settle on the next tick, same as on mount.
    await act(() => Promise.resolve());
    expect(view.querySelector(".expanded__artefact-ref-newer")).toBeNull();
  });

  it("shows no 'Update all in section' button when nothing is outdated", async () => {
    const view = mount({
      initialMarkdown: REFERENCE,
      artefacts: artefactsFile(),
    });
    await act(() => Promise.resolve());
    expect(view.querySelector(".expanded__update-all")).toBeNull();
  });

  it("offers no Update controls when disabled (read-only), though the mark still shows (FR-EDT-07)", async () => {
    const view = mount({
      initialMarkdown: REFERENCE,
      artefacts: artefactsFileOutdated(),
      disabled: true,
    });
    await act(() => Promise.resolve());
    expect(view.textContent).toContain("Newer version available");
    expect(view.querySelector(".expanded__artefact-ref-update")).toBeNull();
    expect(view.querySelector(".expanded__update-all")).toBeNull();
  });
});

describe("RichSectionEditor — static", () => {
  it("shows no editor instance when not live", () => {
    const view = mount({ live: false });
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(0);
  });

  it("renders the stored text, formatted, as read-only content", () => {
    const view = mount({
      live: false,
      initialMarkdown: "This is **bold** text.",
    });
    expect(view.querySelector("strong")?.textContent).toBe("bold");
  });

  it("activates on click", () => {
    const onActivate = vi.fn();
    const view = mount({ live: false, onActivate });
    const button = view.querySelector('[role="button"]');
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("activates on Enter and Space", () => {
    const onActivate = vi.fn();
    const view = mount({ live: false, onActivate });
    const button = view.querySelector('[role="button"]');
    for (const key of ["Enter", " "]) {
      act(() => {
        button?.dispatchEvent(
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

  it("is not focusable or activatable when disabled", () => {
    const onActivate = vi.fn();
    const view = mount({ live: false, disabled: true, onActivate });
    const button = view.querySelector('[role="button"]');
    expect(button?.getAttribute("tabindex")).toBe("-1");
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("activates a resolved reference chip's own callback, not the section's (they nest, but must not both fire)", () => {
    const onActivate = vi.fn();
    const onActivateReference = vi.fn();
    const view = mount({
      live: false,
      initialMarkdown: REFERENCE,
      artefacts: artefactsFile(),
      onActivate,
      onActivateReference,
    });
    const chip = view.querySelector(".expanded__artefact-ref--chip");
    act(() => {
      chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onActivateReference).toHaveBeenCalledWith(ULID, 1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("marks an outdated reference but offers no Update control, since a static section cannot be changed (FR-EDT-07)", () => {
    const view = mount({
      live: false,
      initialMarkdown: REFERENCE,
      artefacts: artefactsFileOutdated(),
    });
    expect(view.textContent).toContain("Newer version available");
    expect(view.querySelector(".expanded__artefact-ref-update")).toBeNull();
  });
});
