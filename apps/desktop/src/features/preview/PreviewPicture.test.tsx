import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { fakePreviewApi, TARGET } from "./model/fakeApi";
import type { PreviewApi } from "./model/load";
import type { PreviewPlan } from "./model/plan";
import { PreviewPicture } from "./PreviewPicture";

/**
 * A result's picture at the detail it is shown at. Small, it is the cached
 * 256 px thumbnail; large, it is the file itself, so a figure can be read.
 */

let root: Root | null = null;
let place: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  place?.remove();
  root = null;
  place = null;
});

async function show(
  api: PreviewApi,
  plan: PreviewPlan,
  detail: "thumbnail" | "full",
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  place = document.createElement("div");
  document.body.append(place);
  root = createRoot(place);
  await act(async () => {
    root?.render(
      <PreviewPicture
        api={api}
        target={TARGET}
        plan={plan}
        name="PCA plot"
        detail={detail}
      />,
    );
    await Promise.resolve();
  });
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  return place;
}

describe("PreviewPicture", () => {
  it("shows the cached thumbnail at thumbnail detail, and does not read the file", async () => {
    const api = fakePreviewApi();
    const view = await show(api, { kind: "image" }, "thumbnail");
    expect(view.querySelector("img")?.getAttribute("src")).toBe(
      "asset://thumbnail",
    );
    expect(api.calls.map((c) => c.command)).toEqual(["previewThumbnail"]);
  });

  it("shows the file itself at full detail for a raster image", async () => {
    const api = fakePreviewApi();
    const view = await show(api, { kind: "image" }, "full");
    expect(view.querySelector("img")?.getAttribute("src")).toBe(
      "asset://image",
    );
    expect(api.calls.map((c) => c.command)).toContain("previewAsset:image");
  });

  it("shows an SVG itself at either detail", async () => {
    const view = await show(fakePreviewApi(), { kind: "svg" }, "full");
    expect(view.querySelector("img")?.getAttribute("src")).toBe("asset://svg");
  });

  it("falls back to the thumbnail when the file cannot be read", async () => {
    const api = fakePreviewApi();
    const failing: PreviewApi = {
      ...api,
      previewAsset: () =>
        Promise.resolve({ status: "error", error: { kind: "internal" } }),
    };
    const view = await show(failing, { kind: "image" }, "full");
    expect(view.querySelector("img")?.getAttribute("src")).toBe(
      "asset://thumbnail",
    );
  });

  it("falls back to the type icon when there is nothing to draw", async () => {
    const view = await show(
      fakePreviewApi({ fail: { kind: "internal" } }),
      { kind: "image" },
      "full",
    );
    expect(view.querySelector("img")).toBeNull();
    expect(view.querySelector('[role="img"]')).not.toBeNull();
  });

  it("does not read a table, script or other file at full detail: its picture is its icon", async () => {
    const api = fakePreviewApi();
    const view = await show(api, { kind: "table" }, "full");
    expect(view.querySelector('[role="img"]')).not.toBeNull();
    expect(api.calls).toEqual([]);
  });

  it("labels the picture with the result's name", async () => {
    const view = await show(fakePreviewApi(), { kind: "image" }, "full");
    expect(view.querySelector("img")?.getAttribute("alt")).toContain(
      "PCA plot",
    );
  });
});
