import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  type ArtefactsFileModel,
  type NotebookState,
} from "@research-notebook/format";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, type ChosenFile } from "../../../ipc/bindings";
import { browseResultsLabel } from "../messages";
import { sampleNotebook, testEnv } from "../model/fakeApi";
import { stubActions } from "../model/testModel";
import { evidenceMessages } from "./evidenceMessages";
import { mountNotebook, prepareInteractiveTable, rowOf } from "./tableTesting";

/**
 * S4-G13 (ADR-0044): adding files in the Results cell. The commands are
 * Rust's, so they are spied on here; what is checked is what the person
 * sees and what is written to artefacts.yaml.
 */

const { state } = sampleNotebook();

prepareInteractiveTable();

const MB = 1024 * 1024;

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

const located = (path: string, size = 10): ChosenFile => ({
  kind: "located",
  name: path.slice(path.lastIndexOf("/") + 1),
  size,
  location: { root: "project", path },
});

function mount(overrides: Parameters<typeof mountNotebook>[1] = {}) {
  const edits: ArtefactsFileModel[] = [];
  const from = withResults(figure);
  const mounted = mountNotebook(from, {
    actions: {
      ...stubActions,
      editArtefacts: (folder, change) => {
        const loaded = from.artefacts?.[folder];
        const before = loaded?.kind === "file" ? loaded.file : EMPTY_ARTEFACTS;
        const changed = change(before, testEnv());
        if (!changed.ok)
          return Promise.resolve({ ok: false, error: changed.error });
        edits.push(changed.value);
        return Promise.resolve({ ok: true });
      },
    },
    ...overrides,
  });
  return { ...mounted, edits };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function openResults(view: HTMLElement) {
  const control = rowOf(view, "EXP-001").querySelector(
    `[aria-label="${browseResultsLabel("EXP-001")}"]`,
  );
  if (!(control instanceof HTMLElement)) throw new Error("no Results control");
  await act(async () => {
    control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
  });
}

function buttonIn(view: HTMLElement, name: string): HTMLButtonElement {
  const found = Array.from(
    rowOf(view, "EXP-001").querySelectorAll("button"),
  ).find((button) => button.textContent === name);
  if (found === undefined) throw new Error(`no ${name} button`);
  return found;
}

async function pressAddFiles(view: HTMLElement) {
  await act(async () => {
    buttonIn(view, evidenceMessages.addFiles).click();
    await settle();
    await settle();
  });
}

const statusIn = (view: HTMLElement) =>
  rowOf(view, "EXP-001").querySelector('[role="status"]')?.textContent ?? "";

const okPick = (...files: ChosenFile[]) =>
  vi
    .spyOn(commands, "pickEvidenceFiles")
    .mockResolvedValue({ status: "ok", data: files });

afterEach(() => vi.restoreAllMocks());

describe("adding files in the Results cell (FR-EVD-01, FR-EVD-02)", () => {
  it("copies a picked file and records it as a new result", async () => {
    okPick(located("results/volcano.png"));
    const capture = vi.spyOn(commands, "captureEvidence").mockResolvedValue({
      status: "ok",
      data: {
        result: {
          kind: "created",
          file: "evidence/volcano.png",
          sha256: "b".repeat(64),
          size: 10,
          number: 1,
        },
        matchesOtherArtefact: false,
        provenance: null,
      },
    });
    const { view, edits } = mount();
    await openResults(view);
    await pressAddFiles(view);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.artefacts.map((a) => a.name)).toEqual([
      "PCA plot",
      "volcano",
    ]);
    expect(statusIn(view)).toContain("Copied volcano.png");
  });

  it("links a file above the threshold and never copies it", async () => {
    okPick(located("raw/reads.csv", 150 * MB));
    const capture = vi.spyOn(commands, "captureEvidence");
    const observe = vi.spyOn(commands, "observeEvidence").mockResolvedValue({
      status: "ok",
      data: {
        sha256: "c".repeat(64),
        size: 150 * MB,
        observedMtime: "2026-09-26T09:00:00Z",
      },
    });
    const { view, edits } = mount();
    await openResults(view);
    await pressAddFiles(view);

    expect(capture).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(edits[0]?.artefacts.at(-1)).toMatchObject({ mode: "link" });
    expect(statusIn(view)).toContain("Linked reads.csv");
  });

  it("says why a file outside the project was not added, and saves nothing", async () => {
    okPick({
      kind: "refused",
      name: "notes.txt",
      reason: { kind: "outsideRoots" },
    });
    const { view, edits } = mount();
    await openResults(view);
    await pressAddFiles(view);

    expect(edits).toHaveLength(0);
    expect(statusIn(view)).toContain("notes.txt was not added");
    expect(statusIn(view)).toContain("outside the project folder");
  });

  it("makes no version for an unchanged file and says so", async () => {
    okPick(located("results/pca.png"));
    vi.spyOn(commands, "captureEvidence").mockResolvedValue({
      status: "ok",
      data: {
        result: { kind: "duplicate", version: 1 },
        matchesOtherArtefact: false,
        provenance: null,
      },
    });
    const { view, edits } = mount();
    await openResults(view);
    await pressAddFiles(view);

    expect(edits).toHaveLength(0);
    expect(statusIn(view)).toContain("PCA plot is unchanged since v1");
  });

  it("does nothing when the person cancels the picker", async () => {
    okPick();
    const { view, edits } = mount();
    await openResults(view);
    await pressAddFiles(view);

    expect(edits).toHaveLength(0);
    expect(statusIn(view)).toBe("");
  });

  it("cannot add in a read-only project", async () => {
    const { view } = mount({ writable: false });
    await openResults(view);

    expect(buttonIn(view, evidenceMessages.addFiles).disabled).toBe(true);
  });
});
