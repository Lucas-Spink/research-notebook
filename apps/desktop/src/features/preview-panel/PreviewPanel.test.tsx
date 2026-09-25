import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ArtefactsFileModel,
  ReferenceIndex,
} from "@research-notebook/format";
import { PreviewPanel } from "./PreviewPanel";
import { fakePanelApi, FOLDER, PROJECT_ID } from "./model/fakeApi";

const NO_REFERENCES: ReferenceIndex = new Map();

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function mount(
  file: ArtefactsFileModel,
  artefactId: string,
  api = fakePanelApi(),
  version?: number | null,
  references: ReferenceIndex = NO_REFERENCES,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <PreviewPanel
        api={api}
        folder={FOLDER}
        projectId={PROJECT_ID}
        experimentFolder="EXP-001"
        file={file}
        artefactId={artefactId}
        references={references}
        {...(version === undefined ? {} : { version })}
      />,
    ),
  );
  return { container, api };
}

const COPY_ID = "01JB0000000000000000000001";
const LINK_ID = "01JB0000000000000000000002";
const GROUP_ID = "01JC000000000000000000000A";

function sample(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: COPY_ID,
        name: "Volcano plot",
        role: "result",
        mode: "copy",
        type: "other",
        source: { root: "project", path: "out/volcano.dat" },
        created: "2026-09-01T09:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/volcano.dat",
            sha256: "a".repeat(64),
            size: 100,
            captured: "2026-09-01T09:00:00Z",
          },
        ],
      },
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
    groups: [{ id: GROUP_ID, name: "Figures", items: [COPY_ID], groups: [] }],
  };
}

/** `sample()`'s copy-mode artefact with a second version, for tests that
 * tell the pinned version apart from the latest (FR-EDT-06). */
function twoVersions(): ArtefactsFileModel {
  const file = sample();
  return {
    ...file,
    artefacts: file.artefacts.map((artefact) =>
      artefact.id === COPY_ID && artefact.mode === "copy"
        ? {
            ...artefact,
            versions: [
              ...artefact.versions,
              {
                v: 2,
                file: "evidence/volcano-v2.dat",
                sha256: "c".repeat(64),
                size: 150,
                captured: "2026-09-02T09:00:00Z",
              },
            ],
          }
        : artefact,
    ),
  };
}

const buttonTexts = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].map((b) => b.textContent);

describe("PreviewPanel", () => {
  it("shows the artefact's name, type, role and mode", async () => {
    const { container } = mount(sample(), COPY_ID);
    await act(() => Promise.resolve());
    expect(container.textContent).toContain("Volcano plot");
    expect(container.textContent).toContain("Other");
    expect(container.textContent).toContain("Result");
    expect(container.textContent).toContain("Copy");
  });

  it("shows the group locations it is a member of", async () => {
    const { container } = mount(sample(), COPY_ID);
    await act(() => Promise.resolve());
    expect(container.textContent).toContain("Figures");
  });

  it("says an artefact with no membership is not in any group", async () => {
    const { container } = mount(sample(), LINK_ID);
    await act(() => Promise.resolve());
    expect(container.textContent).toContain("Not in any group.");
  });

  it("says an artefact nothing references is not referenced anywhere", async () => {
    const { container } = mount(sample(), COPY_ID);
    await act(() => Promise.resolve());
    expect(container.textContent).toContain("Not referenced anywhere.");
  });

  it("lists every experiment and section that references the artefact (FR-SRC-03)", async () => {
    const references: ReferenceIndex = new Map([
      [
        COPY_ID,
        [
          {
            experimentFolder: "EXP-001",
            experimentRef: "EXP-001",
            experimentTitle: "Baseline run",
            section: "methods",
          },
          {
            experimentFolder: "EXP-002",
            experimentRef: "EXP-002",
            experimentTitle: "Replicate",
            section: "interpretation",
          },
        ],
      ],
    ]);
    const { container } = mount(
      sample(),
      COPY_ID,
      fakePanelApi(),
      undefined,
      references,
    );
    await act(() => Promise.resolve());
    const items = [
      ...container.querySelectorAll('[aria-label="Referenced in"] li'),
    ];
    expect(items.map((item) => item.textContent)).toEqual([
      "EXP-001 Baseline run / Methods",
      "EXP-002 Replicate / Interpretation",
    ]);
  });

  it("lists every version's capture time for a copy-mode artefact", async () => {
    const { container } = mount(sample(), COPY_ID);
    await act(() => Promise.resolve());
    expect(
      container.querySelectorAll('[aria-label="Versions"] li'),
    ).toHaveLength(1);
    expect(container.textContent).toContain(
      "v1, captured 2026-09-01T09:00:00Z",
    );
  });

  it("checks and shows a link-mode artefact's live availability", async () => {
    const api = fakePanelApi({ availability: { kind: "missing" } });
    const { container } = mount(sample(), LINK_ID, api);
    await act(() => Promise.resolve());
    expect(container.textContent).toContain(
      "Missing: the file is not at its recorded location.",
    );
    expect(api.calls).toContainEqual({
      command: "linkedArtefactAvailability",
      root: "project",
      path: "data/counts.dat",
    });
  });

  it("checks availability again on request", async () => {
    const api = fakePanelApi({ availability: { kind: "missing" } });
    const { container } = mount(sample(), LINK_ID, api);
    await act(() => Promise.resolve());
    expect(api.calls).toHaveLength(1);

    const recheck = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Check again",
    );
    await act(async () => {
      recheck?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(api.calls).toHaveLength(2);
  });

  it("offers the five distinct file actions", async () => {
    const { container } = mount(sample(), COPY_ID);
    await act(() => Promise.resolve());
    const texts = buttonTexts(container);
    expect(texts).toEqual(
      expect.arrayContaining([
        "Open file",
        "Reveal",
        "Open in VS Code",
        "Copy path",
        "Open project folder",
      ]),
    );
  });

  it("sends the captured file's project-relative path to its action command", async () => {
    const { container, api } = mount(sample(), COPY_ID);
    await act(() => Promise.resolve());
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Open file",
    );
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(api.calls).toContainEqual({
      command: "openCapturedFileAction",
      file: "_notebook/experiments/EXP-001/evidence/volcano.dat",
      action: "openFile",
    });
  });

  it("sends a linked artefact's source root and path to its action command", async () => {
    const { container, api } = mount(sample(), LINK_ID);
    await act(() => Promise.resolve());
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Reveal",
    );
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(api.calls).toContainEqual({
      command: "openLinkedFileAction",
      root: "project",
      path: "data/counts.dat",
      action: "reveal",
    });
  });

  it("shows nothing for an artefact id the file does not have", async () => {
    const { container } = mount(sample(), "01JB0000000000000000000099");
    await act(() => Promise.resolve());
    expect(container.querySelector(".panel")).toBeNull();
  });

  it("shows an explicit version's file, not the latest, and marks it Pinned (FR-EDT-06)", async () => {
    const file = twoVersions();
    const { container } = mount(file, COPY_ID, fakePanelApi(), 1);
    await act(() => Promise.resolve());
    expect(container.textContent).toContain("volcano.dat");
    expect(container.textContent).not.toContain("volcano-v2.dat");
    const items = [...container.querySelectorAll('[aria-label="Versions"] li')];
    expect(
      items.find((li) => li.textContent?.includes("v1"))?.textContent,
    ).toContain("Pinned");
    expect(
      items.find((li) => li.textContent?.includes("v2"))?.textContent,
    ).not.toContain("Pinned");
  });

  it("shows the latest version, unmarked, when no version is given", async () => {
    const file = twoVersions();
    const { container } = mount(file, COPY_ID);
    await act(() => Promise.resolve());
    expect(container.textContent).toContain("volcano-v2.dat");
    for (const li of container.querySelectorAll('[aria-label="Versions"] li')) {
      expect(li.textContent).not.toContain("Pinned");
    }
  });
});
