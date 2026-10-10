import type { ArtefactsFileModel } from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolderHandle } from "../../../ipc/bindings";
import {
  linkedResults,
  useMissingLinks,
  type LinkCheckApi,
} from "./useMissingLinks";

const folder: FolderHandle = 1;
const PROJECT = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";

const ids = {
  r: (n: number) => `01JB${String(n).padStart(22, "0")}`,
};

const linked = (id: string, name: string) => ({
  id,
  name,
  role: "result" as const,
  mode: "link" as const,
  type: "image" as const,
  source: { root: "project", path: `out/${name}.png` },
  created: "2026-09-01T09:00:00Z",
  link: {
    sha256: "b".repeat(64),
    size: 10,
    observed_mtime: "2026-09-01T09:00:00Z",
    checked: "2026-09-01T09:00:00Z",
  },
});

const copied = (id: string, name: string) => ({
  id,
  name,
  role: "result" as const,
  mode: "copy" as const,
  type: "image" as const,
  source: { root: "project", path: `out/${name}.png` },
  created: "2026-09-01T09:00:00Z",
  versions: [
    {
      v: 1,
      file: `evidence/${name}.png`,
      sha256: "a".repeat(64),
      size: 10,
      captured: "2026-09-01T09:00:00Z",
    },
  ],
});

const file = (
  artefacts: ArtefactsFileModel["artefacts"],
): ArtefactsFileModel => ({
  format_version: 1,
  artefacts,
  groups: [],
});

/** Two results recorded in place, then one copied into the project. */
const withLinks = () =>
  file([
    linked(ids.r(1), "Volcano plot"),
    linked(ids.r(2), "Heatmap"),
    copied(ids.r(3), "Counts"),
  ]);
const sampleArtefacts = () => file([copied(ids.r(3), "Counts")]);

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

async function mount(api: LinkCheckApi, file: ArtefactsFileModel | null) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let seen: ReadonlySet<string> = new Set();
  function Probe() {
    seen = useMissingLinks(api, folder, PROJECT, file);
    return null;
  }
  const container = document.createElement("div");
  root = createRoot(container);
  act(() => root?.render(<Probe />));
  await act(() => Promise.resolve());
  return () => seen;
}

describe("linkedResults", () => {
  it("lists only linked results, with where each is recorded", () => {
    expect(linkedResults(withLinks()).map((l) => l.artefactId)).toEqual([
      ids.r(1),
      ids.r(2),
    ]);
    expect(linkedResults(sampleArtefacts())).toEqual([]);
  });
});

describe("useMissingLinks", () => {
  const answer = (kind: string) =>
    Promise.resolve({ status: "ok" as const, data: { kind } });

  it("reports the linked results whose file is not available now", async () => {
    const api = {
      linkedArtefactAvailability: vi.fn((_f, _p, _r, path: string) =>
        path.includes("Volcano") ? answer("missing") : answer("available"),
      ),
    } as unknown as LinkCheckApi;
    const missing = await mount(api, withLinks());
    expect([...missing()]).toEqual([ids.r(1)]);
  });

  it("does not call a result missing when the check could not run", async () => {
    const api = {
      linkedArtefactAvailability: vi.fn(() => Promise.reject(new Error("x"))),
    } as unknown as LinkCheckApi;
    const missing = await mount(api, withLinks());
    expect(missing().size).toBe(0);
  });

  it("checks nothing for copied results", async () => {
    const check = vi.fn();
    const api = {
      linkedArtefactAvailability: check,
    } as unknown as LinkCheckApi;
    await mount(api, sampleArtefacts());
    expect(check).not.toHaveBeenCalled();
  });
});
