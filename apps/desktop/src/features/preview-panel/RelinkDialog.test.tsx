import type {
  ArtefactsFileModel,
  NotebookError,
  Result,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./PreviewPanel";
import { fakePanelApi, FOLDER, PROJECT_ID } from "./model/fakeApi";
import { panelMessages as m } from "./messages";
import type { RelinkCapability } from "./model/relink";

/**
 * Relink (FR-EVD-08, ADR-0031 §3): a missing linked artefact offers Relink,
 * choosing a folder lists its ranked candidates, and confirming one records
 * it through `editArtefacts`. Nothing is recorded before that confirmation.
 */

const LINK_ID = "01JB0000000000000000000002";

function linked(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: LINK_ID,
        name: "Raw counts",
        role: "result",
        mode: "link",
        type: "other",
        source: { root: "project", path: "data/counts.dat" },
        created: "2026-09-01T09:00:00Z",
        link: {
          sha256: "b".repeat(64),
          size: 250,
          observed_mtime: "2026-09-01T09:00:00Z",
          checked: "2026-09-01T09:00:00Z",
        },
      },
    ],
    groups: [],
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

const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 0)));

function mount(file: ArtefactsFileModel, relink: RelinkCapability) {
  const api = fakePanelApi({ availability: { kind: "missing" } });
  const pickDiscoveryFolder = vi.fn().mockResolvedValue({
    status: "ok",
    data: {
      kind: "located",
      name: "moved",
      folder: { root: "project", prefix: "moved" },
    },
  });
  const listRelinkCandidates = vi.fn().mockResolvedValue({
    status: "ok",
    data: [
      {
        location: { root: "project", path: "moved/counts.dat" },
        name: "counts.dat",
        sha256: "b".repeat(64),
        size: 250,
        observedMtime: "2026-09-28T10:00:00Z",
        nameMatches: true,
        sizeMatches: true,
        hashMatches: true,
      },
    ],
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <PreviewPanel
        api={{ ...api, pickDiscoveryFolder, listRelinkCandidates }}
        folder={FOLDER}
        projectId={PROJECT_ID}
        experimentFolder="EXP-001"
        file={file}
        artefactId={LINK_ID}
        references={new Map()}
        relink={relink}
      />,
    ),
  );
  return { container, pickDiscoveryFolder, listRelinkCandidates };
}

function fakeRelink(): {
  relink: RelinkCapability;
  edits: ArtefactsFileModel[];
} {
  const edits: ArtefactsFileModel[] = [];
  const relink: RelinkCapability = {
    externalRoots: [],
    editArtefacts: (
      _experimentFolder: string,
      change: (
        file: ArtefactsFileModel,
        env: { now: () => Date; newId: () => string; appVersion: string },
      ) => Result<ArtefactsFileModel, NotebookError>,
    ) => {
      const changed = change(linked(), {
        now: () => new Date("2026-09-28T10:00:00Z"),
        newId: () => "01JD0000000000000000000001",
        appVersion: "0.2.0",
      });
      if (!changed.ok)
        return Promise.resolve({ ok: false, error: changed.error });
      edits.push(changed.value);
      return Promise.resolve({ ok: true });
    },
  };
  return { relink, edits };
}

function buttonNamed(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find(
    (b) => b.textContent === name,
  );
  if (found === undefined) throw new Error(`no "${name}" button`);
  return found;
}

describe("Relink", () => {
  it("offers Relink for a missing linked artefact", async () => {
    const { relink } = fakeRelink();
    const { container } = mount(linked(), relink);
    await settle();
    expect(buttonNamed(container, m.relink.findNewLocation)).toBeDefined();
  });

  it("lists ranked candidates and records the one confirmed", async () => {
    const { relink, edits } = fakeRelink();
    const { container, pickDiscoveryFolder, listRelinkCandidates } = mount(
      linked(),
      relink,
    );
    await settle();

    buttonNamed(container, m.relink.findNewLocation).click();
    await settle();

    expect(pickDiscoveryFolder).toHaveBeenCalledTimes(1);
    expect(listRelinkCandidates).toHaveBeenCalledWith(
      FOLDER,
      PROJECT_ID,
      { root: "project", prefix: "moved" },
      "counts.dat",
      250,
      "b".repeat(64),
    );
    expect(container.textContent).toContain("counts.dat");

    buttonNamed(container, m.relink.useThis).click();
    await settle();

    expect(edits).toHaveLength(1);
    const artefact = edits[0]?.artefacts[0];
    expect(artefact?.mode).toBe("link");
    if (artefact?.mode === "link") {
      expect(artefact.source).toEqual({
        root: "project",
        path: "moved/counts.dat",
      });
      expect(artefact.link.sha256).toBe("b".repeat(64));
    }
  });

  it("says when nothing in the chosen folder matches", async () => {
    const { relink } = fakeRelink();
    const { container, listRelinkCandidates } = mount(linked(), relink);
    listRelinkCandidates.mockResolvedValue({ status: "ok", data: [] });
    await settle();

    buttonNamed(container, m.relink.findNewLocation).click();
    await settle();

    expect(container.textContent).toContain(m.relink.noCandidates);
  });

  it("is not offered when no relink capability is given", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const place = document.createElement("div");
    document.body.append(place);
    const r = createRoot(place);
    act(() =>
      r.render(
        <PreviewPanel
          api={fakePanelApi({ availability: { kind: "missing" } })}
          folder={FOLDER}
          projectId={PROJECT_ID}
          experimentFolder="EXP-001"
          file={linked()}
          artefactId={LINK_ID}
          references={new Map()}
        />,
      ),
    );
    await settle();
    expect(
      [...place.querySelectorAll("button")].some(
        (b) => b.textContent === m.relink.findNewLocation,
      ),
    ).toBe(false);
    act(() => r.unmount());
    place.remove();
  });
});
