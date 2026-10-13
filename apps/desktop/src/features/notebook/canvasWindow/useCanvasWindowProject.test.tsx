import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { CanvasWindowContext } from "../../../ipc/bindings";
import { fakeProject, filesOf, sampleNotebook } from "../model/fakeApi";
import type { CanvasWindowApi } from "./api";
import { fakeWindowApi } from "./testWindowApi";
import {
  useCanvasWindowProject,
  type CanvasWindowProject,
} from "./useCanvasWindowProject";

const CONTEXT: CanvasWindowContext = { folder: 1, writable: true };

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

const flush = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

function mount(api: CanvasWindowApi, project: ReturnType<typeof fakeProject>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let latest: CanvasWindowProject = { status: "loading" };
  function Probe() {
    latest = useCanvasWindowProject({
      api,
      read: project.read,
      debounceMs: 0,
    });
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root?.render(<Probe />));
  return () => latest;
}

const listCalls = (project: ReturnType<typeof fakeProject>) =>
  project.calls.filter((call) => call === "list").length;

describe("useCanvasWindowProject", () => {
  it("is unavailable when the window was not opened by the main one", async () => {
    const project = fakeProject(filesOf(sampleNotebook().state));
    const { api } = fakeWindowApi(null);
    const state = mount(api, project);
    await flush();
    expect(state().status).toBe("unavailable");
    expect(listCalls(project)).toBe(0);
  });

  it("loads the project the main window opened, keeping whether it is writable", async () => {
    const project = fakeProject(filesOf(sampleNotebook().state));
    const { api } = fakeWindowApi({ folder: 1, writable: false });
    const state = mount(api, project);
    await flush();
    const ready = state();
    if (ready.status !== "ready") throw new Error(ready.status);
    expect(ready.writable).toBe(false);
    expect(ready.arranged.questions.length).toBeGreaterThan(0);
  });

  it("reads the notebook again when a question or experiment changed", async () => {
    const project = fakeProject(filesOf(sampleNotebook().state));
    const { api, send } = fakeWindowApi(CONTEXT);
    mount(api, project);
    await flush();
    const before = listCalls(project);
    send({ paths: ["_notebook/questions/Q-001.md"], needsRescan: false });
    await flush();
    expect(listCalls(project)).toBe(before + 1);
  });

  it("does not read again for canvas files, which are this window's own saves", async () => {
    const project = fakeProject(filesOf(sampleNotebook().state));
    const { api, send } = fakeWindowApi(CONTEXT);
    mount(api, project);
    await flush();
    const before = listCalls(project);
    send({
      paths: ["_notebook/canvases/01JAXQ0000000000000000000A.canvas.json"],
      needsRescan: false,
    });
    await flush();
    expect(listCalls(project)).toBe(before);
  });

  it("keeps showing the last notebook when a reload fails", async () => {
    const project = fakeProject(filesOf(sampleNotebook().state));
    const { api, send } = fakeWindowApi(CONTEXT);
    const state = mount(api, project);
    await flush();
    project.faults.failList = true;
    send({ paths: [], needsRescan: true });
    await flush();
    expect(state().status).toBe("ready");
  });

  it("stops listening when the window closes", async () => {
    const project = fakeProject(filesOf(sampleNotebook().state));
    const fake = fakeWindowApi(CONTEXT);
    mount(fake.api, project);
    await flush();
    expect(fake.listeners()).toBe(1);
    act(() => root?.unmount());
    root = null;
    expect(fake.listeners()).toBe(0);
  });
});
