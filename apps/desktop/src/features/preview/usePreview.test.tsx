import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { fakePreviewApi, TARGET } from "./model/fakeApi";
import type { PreviewApi, PreviewState } from "./model/load";
import type { PreviewPlan } from "./model/plan";
import { usePreview } from "./usePreview";

type Held = ReturnType<typeof usePreview>;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

/** Renders the hook and returns a way to read what it last returned. */
async function run(api: PreviewApi, plan: PreviewPlan) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let held: Held | null = null;
  function Probe() {
    held = usePreview({ api, target: TARGET, plan });
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

const status = (state: PreviewState) =>
  state.status === "failed" ? `failed:${state.failure}` : state.status;

describe("usePreview", () => {
  it("loads a table, and loads it again expanded when asked", async () => {
    const api = fakePreviewApi();
    const current = await run(api, { kind: "table" });
    expect(current().state).toMatchObject({
      status: "ready",
      content: { expanded: false },
    });

    await act(() => {
      current().expand();
      return Promise.resolve();
    });

    expect(current().expanded).toBe(true);
    expect(current().state).toMatchObject({ content: { expanded: true } });
    expect(api.calls.map((c) => c.command)).toEqual([
      "previewTable:initial",
      "previewTable:expanded",
    ]);
  });

  it("tries again on request, and shows a drawing failure as renderFailed", async () => {
    const api = fakePreviewApi({ fail: { kind: "fileUnavailable" } });
    const current = await run(api, { kind: "image" });
    expect(status(current().state)).toBe("failed:fileUnavailable");

    await act(() => {
      current().retry();
      return Promise.resolve();
    });
    expect(api.calls).toHaveLength(2);

    act(() => current().renderFailed());
    expect(status(current().state)).toBe("failed:renderFailed");
  });

  it("toggles between fitted and actual size", async () => {
    const current = await run(fakePreviewApi(), { kind: "image" });
    expect(current().zoomed).toBe(false);
    act(() => current().toggleZoom());
    expect(current().zoomed).toBe(true);
  });
});
