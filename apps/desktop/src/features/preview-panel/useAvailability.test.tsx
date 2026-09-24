import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { fakePanelApi, FOLDER, PROJECT_ID } from "./model/fakeApi";
import type { AvailabilityState } from "./model/availability";
import { useAvailability } from "./useAvailability";

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

async function run(
  api: ReturnType<typeof fakePanelApi>,
  source: { root: string; path: string } | undefined,
  attempt = 0,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let held: AvailabilityState | undefined;
  function Probe() {
    held = useAvailability({
      api,
      folder: FOLDER,
      projectId: PROJECT_ID,
      source,
      attempt,
    });
    return null;
  }
  root = createRoot(document.createElement("div"));
  await act(() => {
    root?.render(<Probe />);
    return Promise.resolve();
  });
  return () => held;
}

describe("useAvailability", () => {
  it("is undefined for a copy-mode artefact, with no command call", async () => {
    const api = fakePanelApi();
    const current = await run(api, undefined);
    expect(current()).toBeUndefined();
    expect(api.calls).toEqual([]);
  });

  it("checks a link-mode artefact's source and reports what it found", async () => {
    const api = fakePanelApi({ availability: { kind: "missing" } });
    const current = await run(api, {
      root: "project",
      path: "results/pca.csv",
    });
    expect(current()).toEqual({
      status: "checked",
      availability: { kind: "missing" },
    });
    expect(api.calls).toEqual([
      {
        command: "linkedArtefactAvailability",
        root: "project",
        path: "results/pca.csv",
      },
    ]);
  });

  it("reports a refused check as failed, not as a thrown exception", async () => {
    const api = fakePanelApi({
      availabilityFails: { kind: "settingsUnavailable" },
    });
    const current = await run(api, { root: "project", path: "x" });
    expect(current()).toEqual({ status: "failed" });
  });
});
