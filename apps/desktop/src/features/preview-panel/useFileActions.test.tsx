import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { fakePanelApi, FOLDER, PROJECT_ID } from "./model/fakeApi";
import { useFileActions, type ActionTarget } from "./useFileActions";

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

type Held = ReturnType<typeof useFileActions>;

async function run(api: ReturnType<typeof fakePanelApi>, target: ActionTarget) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let held: Held | null = null;
  function Probe() {
    held = useFileActions({
      api,
      folder: FOLDER,
      projectId: PROJECT_ID,
      target,
    });
    return null;
  }
  root = createRoot(document.createElement("div"));
  await act(() => {
    root?.render(<Probe />);
    return Promise.resolve();
  });
  return () => {
    if (held === null) throw new Error("the hook did not render");
    return held;
  };
}

describe("useFileActions", () => {
  it("opens a captured file's action by its project-relative path", async () => {
    const api = fakePanelApi();
    const current = await run(api, {
      kind: "captured",
      file: "_notebook/experiments/EXP-001/evidence/a.png",
    });

    await act(async () => {
      await current().run("openFile");
    });

    expect(api.calls).toEqual([
      {
        command: "openCapturedFileAction",
        file: "_notebook/experiments/EXP-001/evidence/a.png",
        action: "openFile",
      },
    ]);
    expect(current().busy).toBe(false);
    expect(current().message).toBeNull();
  });

  it("opens a linked file's action by its source root and path", async () => {
    const api = fakePanelApi();
    const current = await run(api, {
      kind: "linked",
      root: "project",
      path: "results/pca.csv",
    });

    await act(async () => {
      await current().run("reveal");
    });

    expect(api.calls).toEqual([
      {
        command: "openLinkedFileAction",
        root: "project",
        path: "results/pca.csv",
        action: "reveal",
      },
    ]);
  });

  it("shows a message once the path is copied", async () => {
    const api = fakePanelApi();
    const current = await run(api, { kind: "captured", file: "a" });

    await act(async () => {
      await current().run("copyPath");
    });

    expect(current().message).toBe("Path copied.");
  });

  it("reports a refused action with a readable message, not an exception", async () => {
    const api = fakePanelApi({ actionFails: { kind: "fileUnavailable" } });
    const current = await run(api, { kind: "captured", file: "a" });

    await act(async () => {
      await current().run("openFile");
    });

    expect(current().message).toBe(
      "The file could not be opened. Another program may be using it.",
    );
  });

  it("opens the project folder", async () => {
    const api = fakePanelApi();
    const current = await run(api, { kind: "captured", file: "a" });

    await act(async () => {
      await current().openProjectFolder();
    });

    expect(api.calls).toEqual([{ command: "openProjectFolder" }]);
  });
});
