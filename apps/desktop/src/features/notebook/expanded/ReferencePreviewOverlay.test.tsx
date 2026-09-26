import type {
  ArtefactsFileModel,
  ReferenceIndex,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PanelApi } from "../../preview-panel";
import { ReferencePreviewOverlay } from "./ReferencePreviewOverlay";

const FOLDER = 1;
const PROJECT_ID = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";
const ARTEFACT_ID = "01JB0000000000000000000001";
const NO_REFERENCES: ReferenceIndex = new Map();

function sample(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: ARTEFACT_ID,
        name: "PCA by treatment",
        role: "result",
        mode: "copy",
        type: "other",
        source: { root: "project", path: "scripts/pca.R" },
        created: "2026-01-01T00:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/pca.v1.dat",
            sha256: "a".repeat(64),
            size: 10,
            captured: "2026-01-01T00:00:00Z",
          },
          {
            v: 2,
            file: "evidence/pca.v2.dat",
            sha256: "b".repeat(64),
            size: 20,
            captured: "2026-01-02T00:00:00Z",
          },
        ],
      },
    ],
    groups: [],
  };
}

/** Just enough of `PanelApi` for the overlay's own tests; its embedded
 * `PreviewPanel` content is `preview-panel`'s own responsibility to test. */
function fakeApi(): PanelApi {
  const ok = <T,>(data: T) => Promise.resolve({ status: "ok" as const, data });
  return {
    previewAsset: () => ok({ url: "asset://x" }),
    previewThumbnail: () => ok({ url: "asset://x" }),
    previewTable: () =>
      ok({
        header: [],
        rows: [],
        encoding: "utf8" as const,
        complete: true,
        moreRows: false,
        moreColumns: false,
        dimensions: null,
      }),
    previewText: () =>
      ok({ lines: [], encoding: "utf8" as const, complete: true }),
    previewNotebook: () =>
      ok({ kind: "jupyter" as const, language: null, kernel: null }),
    openCapturedFileAction: () => ok(null),
    openLinkedFileAction: () => ok(null),
    openProjectFolder: () => ok(null),
    linkedArtefactAvailability: () => ok({ kind: "available", size: 10 }),
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function mount(version: number | null, onClose = () => undefined) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ReferencePreviewOverlay
        api={fakeApi()}
        folder={FOLDER}
        projectId={PROJECT_ID}
        experimentFolder="EXP-001"
        file={sample()}
        artefactId={ARTEFACT_ID}
        version={version}
        references={NO_REFERENCES}
        onClose={onClose}
      />,
    ),
  );
  // The dialog is rendered into the document body, not where it is opened.
  return document.body;
}

describe("ReferencePreviewOverlay", () => {
  it("renders into the document body, so a table row's transform or clipping cannot trap it (ADR-0043)", async () => {
    mount(1);
    await act(() => Promise.resolve());
    expect(container?.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')?.parentElement).toBe(
      document.body,
    );
  });

  it("is a dialog showing the pinned version's preview panel, not the latest", async () => {
    const view = mount(1);
    await act(() => Promise.resolve());
    expect(view.querySelector('[role="dialog"]')).not.toBeNull();
    expect(view.textContent).toContain("PCA by treatment");
    const items = [...view.querySelectorAll('[aria-label="Versions"] li')];
    expect(
      items.find((li) => li.textContent?.includes("v1"))?.textContent,
    ).toContain("Pinned");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const view = mount(1, onClose);
    await act(() => Promise.resolve());
    act(() => {
      view.querySelector('[role="dialog"]')?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on the close button", async () => {
    const onClose = vi.fn();
    const view = mount(1, onClose);
    await act(() => Promise.resolve());
    const close = [...view.querySelectorAll("button")].find(
      (b) => b.textContent === "Close",
    );
    act(() => {
      close?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("focuses the close button on open", async () => {
    const view = mount(1);
    await act(() => Promise.resolve());
    const close = [...view.querySelectorAll("button")].find(
      (b) => b.textContent === "Close",
    );
    expect(document.activeElement).toBe(close);
  });
});
