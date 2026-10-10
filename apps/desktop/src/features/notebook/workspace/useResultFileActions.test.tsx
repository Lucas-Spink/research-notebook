import type { ArtefactsFileModel } from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolderHandle } from "../../../ipc/bindings";
import {
  useResultFileActions,
  type FileActionApi,
  type ResultFileAction,
} from "./useResultFileActions";

const folder: FolderHandle = 1;
const PROJECT = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";
const COPY = "01JB0000000000000000000001";
const LINK = "01JB0000000000000000000002";

const file: ArtefactsFileModel = {
  format_version: 1,
  artefacts: [
    {
      id: COPY,
      name: "Copied",
      role: "result",
      mode: "copy",
      type: "image",
      source: { root: "project", path: "out/a.png" },
      created: "2026-09-01T09:00:00Z",
      versions: [
        {
          v: 1,
          file: "evidence/a-v1.png",
          sha256: "a".repeat(64),
          size: 1,
          captured: "2026-09-01T09:00:00Z",
        },
        {
          v: 2,
          file: "evidence/a-v2.png",
          sha256: "b".repeat(64),
          size: 1,
          captured: "2026-09-02T09:00:00Z",
        },
      ],
    },
    {
      id: LINK,
      name: "Linked",
      role: "result",
      mode: "link",
      type: "image",
      source: { root: "project", path: "out/b.png" },
      created: "2026-09-01T09:00:00Z",
      link: {
        sha256: "c".repeat(64),
        size: 1,
        observed_mtime: "2026-09-01T09:00:00Z",
        checked: "2026-09-01T09:00:00Z",
      },
    },
  ],
  groups: [],
};

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function mount(api: FileActionApi) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let run: (id: string, action: ResultFileAction) => Promise<boolean> = () =>
    Promise.resolve(false);
  function Probe() {
    run = useResultFileActions(api, folder, PROJECT, "EXP-001", file);
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root?.render(<Probe />));
  return (id: string, action: ResultFileAction) => run(id, action);
}

const ok = () => Promise.resolve({ status: "ok" as const, data: null });

describe("useResultFileActions", () => {
  it("opens the latest captured copy of a copied result", async () => {
    const captured = vi.fn(ok);
    const run = mount({
      openCapturedFileAction: captured,
      openLinkedFileAction: vi.fn(ok),
    });
    expect(await run(COPY, "reveal")).toBe(true);
    expect(captured).toHaveBeenCalledWith(
      folder,
      "_notebook/experiments/EXP-001/evidence/a-v2.png",
      "reveal",
    );
  });

  it("opens a linked result where it lives", async () => {
    const linked = vi.fn(ok);
    const run = mount({
      openCapturedFileAction: vi.fn(ok),
      openLinkedFileAction: linked,
    });
    expect(await run(LINK, "openFile")).toBe(true);
    expect(linked).toHaveBeenCalledWith(
      folder,
      PROJECT,
      "project",
      "out/b.png",
      "openFile",
    );
  });

  it("says it failed for a refusal, a rejected call or an unknown result", async () => {
    const refused = () =>
      Promise.resolve({
        status: "error" as const,
        error: { kind: "fileMissing" },
      });
    const run = mount({
      openCapturedFileAction: vi.fn(refused),
      openLinkedFileAction: vi.fn(() => Promise.reject(new Error("x"))),
    } as unknown as FileActionApi);
    expect(await run(COPY, "openFile")).toBe(false);
    expect(await run(LINK, "openFile")).toBe(false);
    expect(await run("nope", "openFile")).toBe(false);
  });
});
