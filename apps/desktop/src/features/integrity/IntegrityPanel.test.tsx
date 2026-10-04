import type {
  Arranged,
  BibliographyFileModel,
  IntegrityFinding,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntegrityPanel } from "./IntegrityPanel";
import type { IntegrityApi } from "./model/collect";
import { arranged as sample } from "./model/fixtures";
import { useIntegrityCheck } from "./useIntegrityCheck";

/** FR-ARC-01 from the person's side: run the check, resolve or acknowledge each finding. */

const flush = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function fakeApi(
  options: { missing?: boolean; failFiles?: boolean } = {},
): IntegrityApi {
  return {
    checkVersionFiles: () =>
      Promise.resolve(
        options.failFiles === true
          ? { status: "error", error: { kind: "internal" } }
          : {
              status: "ok",
              data:
                options.missing === true ? [{ index: 0, missing: true }] : [],
            },
      ),
    linkedArtefactAvailability: () =>
      Promise.resolve({ status: "ok", data: { kind: "available", size: 10 } }),
  };
}

const NO_SOURCES: BibliographyFileModel = [];

function Harness(props: {
  api: IntegrityApi;
  arranged: Arranged;
  onResolve: (finding: IntegrityFinding, where: string) => void;
}) {
  const model = useIntegrityCheck({
    api: props.api,
    folder: 1,
    projectId: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
    arranged: props.arranged,
    bibliography: NO_SOURCES,
  });
  return <IntegrityPanel model={model} onResolve={props.onResolve} />;
}

async function show(
  api: IntegrityApi,
  onResolve = vi.fn(),
  arranged: Arranged = sample(),
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(
      <Harness api={api} arranged={arranged} onResolve={onResolve} />,
    );
    return Promise.resolve();
  });
  return { onResolve };
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(name),
  );
  if (!found) throw new Error(`no button ${name}`);
  return found;
}

/** Clicks inside `act` and lets the update settle. */
function press(element: HTMLElement | undefined) {
  return act(() => {
    element?.click();
    return Promise.resolve();
  });
}

async function run(name = "Run check") {
  await press(button(name));
  await flush();
}

const status = () =>
  document.querySelector('[role="status"]')?.textContent ?? "";

describe("IntegrityPanel", () => {
  it("says the check has not been run before it is", async () => {
    await show(fakeApi());
    expect(status()).toContain("has not been run");
  });

  it("lists an external file and a missing captured file under their headings", async () => {
    await show(fakeApi({ missing: true }));
    await run();

    const headings = [...document.querySelectorAll("h5")].map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(["Missing files", "External files"]);
    expect(document.body.textContent).toContain(
      "version 1 of “Plot” is missing",
    );
    expect(status()).toBe("2 to resolve or acknowledge");
  });

  it("offers Resolve only where there is something to do", async () => {
    const { onResolve } = await show(fakeApi({ missing: true }));
    await run();

    // The available linked file has nothing to resolve; the missing one has.
    expect(
      [...document.querySelectorAll("button")].filter(
        (b) => b.textContent === "Resolve",
      ),
    ).toHaveLength(1);
    await press(button("Resolve"));
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "missingFile" }),
      "results",
    );
  });

  it("counts acknowledged findings apart and keeps them when the check is run again", async () => {
    await show(fakeApi({ missing: true }));
    await run();

    const boxes = document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    await press(boxes[0]);
    expect(status()).toBe("1 to resolve or acknowledge, 1 acknowledged");

    await run("Check again");
    expect(status()).toBe("1 to resolve or acknowledge, 1 acknowledged");
  });

  it("drops the acknowledgement of a finding that has gone", async () => {
    const api = fakeApi({ missing: true });
    await show(api);
    await run();
    await press(
      document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0],
    );

    api.checkVersionFiles = () => Promise.resolve({ status: "ok", data: [] });
    await run("Check again");

    expect(status()).toBe("1 to resolve or acknowledge");
  });

  it("says so when nothing is wrong", async () => {
    await show(fakeApi(), vi.fn(), {
      questions: [],
      unassigned: [],
      problems: [],
    });
    await run();
    expect(status()).toBe("No problems found.");
  });

  it("alerts instead of reporting a clean project when the files cannot be checked", async () => {
    await show(fakeApi({ failFiles: true }));
    await run();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "could not be completed",
    );
    expect(document.querySelectorAll("h5")).toHaveLength(0);
  });
});
