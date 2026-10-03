import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  type ArtefactsFileModel,
  type NotebookError,
  type NotebookState,
  type Result,
} from "@research-notebook/format";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type DiscoveryProgressDto } from "../../../ipc/bindings";
import { addResultLabel } from "../messages";
import { sampleNotebook, testEnv } from "../model/fakeApi";
import { stubActions } from "../model/testModel";
import { discoveryMessages } from "./evidenceMessages";
import { mountNotebook, prepareInteractiveTable, rowOf } from "./tableTesting";

/**
 * Discovery (FR-EVD-09, ADR-0035, ADR-0044 point 7): choosing a folder,
 * scanning it with progress, and adding the files the person selects. The
 * scan and capture commands are Rust's, so they are spied on here.
 */

const { state } = sampleNotebook();

prepareInteractiveTable();

// `Channel` (ADR-0044 point 7) registers a callback with the Tauri runtime
// on construction; this jsdom test provides the minimal shape it needs.
beforeEach(() => {
  vi.stubGlobal("__TAURI_INTERNALS__", {
    transformCallback: () => 0,
    unregisterCallback: () => undefined,
  });
  vi.spyOn(commands, "defaultDiscoveryExcludes").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const figure = ArtefactsFile.parse({
  ...EMPTY_ARTEFACTS,
  artefacts: [
    {
      id: "01JB0000000000000000000001",
      name: "PCA plot",
      role: "result",
      mode: "copy",
      type: "image",
      source: { root: "project", path: "results/pca.png" },
      created: "2026-09-26T10:00:00Z",
      versions: [
        {
          v: 1,
          file: "evidence/pca.png",
          sha256: "a".repeat(64),
          size: 10,
          captured: "2026-09-26T10:00:00Z",
        },
      ],
    },
  ],
});

const withResults = (file: ArtefactsFileModel): NotebookState => ({
  ...state,
  artefacts: { ...state.artefacts, "EXP-001": { kind: "file", file } },
});

function mount() {
  const edits: ArtefactsFileModel[] = [];
  const from = withResults(figure);
  const mounted = mountNotebook(from, {
    actions: {
      ...stubActions,
      editArtefacts: (
        folder: string,
        change: (
          file: ArtefactsFileModel,
          env: ReturnType<typeof testEnv>,
        ) => Result<ArtefactsFileModel, NotebookError>,
      ) => {
        const loaded = from.artefacts?.[folder];
        const before = loaded?.kind === "file" ? loaded.file : EMPTY_ARTEFACTS;
        const changed = change(before, testEnv());
        if (!changed.ok) {
          return Promise.resolve({ ok: false as const, error: changed.error });
        }
        edits.push(changed.value);
        return Promise.resolve({ ok: true as const });
      },
    },
  });
  return { ...mounted, edits };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function openResults(view: HTMLElement) {
  const control = rowOf(view, "EXP-001").querySelector(
    `[aria-label="${addResultLabel("EXP-001")}"]`,
  );
  if (!(control instanceof HTMLElement)) throw new Error("no Results control");
  await act(async () => {
    control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
  });
}

/** The Add result pane, where adding files now happens. */
const paneOf = (view: HTMLElement) => view.querySelector("aside.pane");

function buttonIn(view: HTMLElement, name: string): HTMLButtonElement {
  const found = Array.from(paneOf(view)?.querySelectorAll("button") ?? []).find(
    (button) => button.textContent === name,
  );
  if (found === undefined) throw new Error(`no ${name} button`);
  return found;
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await settle();
    await settle();
  });
}

const statusIn = (view: HTMLElement) =>
  paneOf(view)?.querySelector('[role="status"]')?.textContent ?? "";

describe("finding files in the Results cell (FR-EVD-09)", () => {
  it("scans a chosen folder, reports progress, and adds what is selected", async () => {
    vi.spyOn(commands, "pickDiscoveryFolder").mockResolvedValue({
      status: "ok",
      data: {
        kind: "located",
        name: "raw",
        folder: { root: "project", prefix: "raw" },
      },
    });
    vi.spyOn(commands, "defaultDiscoveryExcludes").mockResolvedValue([
      "node_modules",
    ]);
    let sentProgress: ((progress: DiscoveryProgressDto) => void) | null = null;
    vi.spyOn(commands, "startDiscovery").mockImplementation(
      (_folder, _projectId, _chosen, _options, _captured, progress) => {
        sentProgress = (data) => progress.onmessage(data);
        return Promise.resolve({
          status: "ok",
          data: {
            files: [
              {
                location: { root: "project", path: "raw/counts.csv" },
                name: "counts.csv",
                size: 12,
                modified: "2026-09-28T10:00:00Z",
                captured: false,
              },
            ],
            foldersVisited: 1,
            skipped: 0,
            cancelled: false,
          },
        });
      },
    );
    const capture = vi.spyOn(commands, "captureEvidence").mockResolvedValue({
      status: "ok",
      data: {
        result: {
          kind: "created",
          file: "evidence/counts.csv",
          sha256: "d".repeat(64),
          size: 12,
          number: 1,
        },
        matchesOtherArtefact: false,
        provenance: null,
      },
    });
    const { view, edits } = mount();

    await openResults(view);
    await click(buttonIn(view, discoveryMessages.findFiles));
    await click(buttonIn(view, discoveryMessages.scan));
    act(() => sentProgress?.({ filesSeen: 3, foldersSeen: 1 }));
    await click(buttonIn(view, discoveryMessages.addSelected));

    expect(capture).toHaveBeenCalledTimes(1);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.artefacts.map((a) => a.name)).toEqual([
      "PCA plot",
      "counts",
    ]);
  });

  it("says why a refused folder cannot be scanned", async () => {
    vi.spyOn(commands, "pickDiscoveryFolder").mockResolvedValue({
      status: "ok",
      data: { kind: "refused", name: "etc", reason: { kind: "outsideRoots" } },
    });
    const { view } = mount();

    await openResults(view);
    await click(buttonIn(view, discoveryMessages.findFiles));

    expect(statusIn(view)).toContain("outside the project folder");
  });

  it("does nothing when the person cancels the folder picker", async () => {
    vi.spyOn(commands, "pickDiscoveryFolder").mockResolvedValue({
      status: "ok",
      data: null,
    });
    const { view, edits } = mount();

    await openResults(view);
    await click(buttonIn(view, discoveryMessages.findFiles));

    expect(edits).toHaveLength(0);
    expect(
      view.querySelector(`[aria-label="${discoveryMessages.heading}"]`),
    ).toBeNull();
  });
});
