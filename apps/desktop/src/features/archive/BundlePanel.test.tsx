import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { BundlePanel } from "./BundlePanel";
import { arranged } from "./model/fixtures";
import type { BundleApi } from "./model/bundle";
import { useBundle } from "./useBundle";

/** FR-ARC-08 from the person's side: see the size, get the FAT32 warning first, then save. */

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

type Plan = Awaited<ReturnType<BundleApi["planBundle"]>>;
type Write = Awaited<ReturnType<BundleApi["writeBundle"]>>;

const SMALL = { files: 4, bytes: 2048, skipped: 0, exceedsFat32Limit: false };
const WRITTEN = {
  kind: "written",
  name: "Screen-notebook.nbk",
  folder: "D:/out",
  bytes: 1536,
  files: 4,
} as const;

function fakeApi(plan: Plan | ((choice: string) => Plan), write: Write) {
  const writes: unknown[][] = [];
  const api: BundleApi = {
    planBundle: (_folder, choice) =>
      Promise.resolve(typeof plan === "function" ? plan(choice) : plan),
    writeBundle: (...args) => {
      writes.push(args);
      return Promise.resolve(write);
    },
  };
  return { api, writes };
}

function Harness({ api }: { api: BundleApi }) {
  const model = useBundle({
    api,
    folder: 1,
    arranged: arranged(),
    projectName: "Screen",
  });
  return <BundlePanel model={model} />;
}

async function show(api: BundleApi) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness api={api} />));
  await flush();
  return container;
}

function button(view: HTMLElement, pattern: RegExp): HTMLButtonElement {
  const found = [...view.querySelectorAll("button")].find((b) =>
    pattern.test(b.textContent),
  );
  if (!found) throw new Error(`no button ${pattern.source}`);
  return found;
}

async function press(view: HTMLElement, pattern: RegExp) {
  act(() => button(view, pattern).click());
  await flush();
}

describe("BundlePanel (FR-ARC-08)", () => {
  it("says what each bundle will hold before anything is saved", async () => {
    const { api, writes } = fakeApi(
      { status: "ok", data: SMALL },
      {
        status: "ok",
        data: null,
      },
    );

    const view = await show(api);

    expect(view.textContent).toContain("Notebook bundle");
    expect(view.textContent).toContain("Full archive");
    expect(view.textContent).toContain("4 files, 2.0 KB before compression.");
    expect(writes).toEqual([]);
  });

  it("warns about FAT32 for a bundle of 4 GB or more, before saving", async () => {
    const { api } = fakeApi(
      (choice) => ({
        status: "ok",
        data: { ...SMALL, exceedsFat32Limit: choice === "archive" },
      }),
      { status: "ok", data: null },
    );

    const view = await show(api);

    const warnings = [...view.querySelectorAll('[role="alert"]')];
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.textContent).toContain("FAT32");
    expect(warnings[0]?.closest('[role="group"]')?.textContent ?? "").toContain(
      "Full archive",
    );
  });

  it("lists linked files in the archive's note, not the notebook bundle's", async () => {
    const { api } = fakeApi(
      { status: "ok", data: SMALL },
      {
        status: "ok",
        data: null,
      },
    );

    const view = await show(api);

    const groups = [...view.querySelectorAll('[role="group"]')];
    expect(groups[0]?.textContent).not.toContain("LINKED_FILES.txt");
    expect(groups[1]?.textContent).toContain("LINKED_FILES.txt");
  });

  it("saves the notebook bundle under the project's name and reports where", async () => {
    const { api, writes } = fakeApi(
      { status: "ok", data: SMALL },
      { status: "ok", data: WRITTEN },
    );
    const view = await show(api);

    await press(view, /save notebook bundle/i);

    expect(writes).toEqual([[1, "notebook", "Screen-notebook", []]]);
    expect(view.textContent).toContain(
      "Saved Screen-notebook.nbk in D:/out, 1.5 KB. It was read back and checked.",
    );
  });

  it("says nothing was saved when the person cancels", async () => {
    const { api } = fakeApi(
      { status: "ok", data: SMALL },
      { status: "ok", data: null },
    );
    const view = await show(api);

    await press(view, /save full archive/i);

    expect(view.textContent).toContain("No bundle was saved.");
  });

  it("explains a drive that refused a large file", async () => {
    const { api } = fakeApi(
      { status: "ok", data: SMALL },
      { status: "ok", data: { kind: "tooLargeForDestination" } },
    );
    const view = await show(api);

    await press(view, /save full archive/i);

    expect(view.textContent).toContain("formatted as FAT32");
    expect(view.textContent).toContain("Nothing was saved");
  });

  it("refuses to look as if a bundle was saved when the command fails", async () => {
    const { api } = fakeApi(
      { status: "ok", data: SMALL },
      { status: "error", error: { kind: "internal" } },
    );
    const view = await show(api);

    await press(view, /save notebook bundle/i);

    expect(view.querySelector('[role="alert"]')?.textContent).toContain(
      "could not be saved",
    );
    expect(view.textContent).not.toContain("Saved ");
  });

  it("still allows saving when the files could not be counted", async () => {
    const { api } = fakeApi(
      { status: "error", error: { kind: "fileUnavailable" } },
      { status: "ok", data: WRITTEN },
    );

    const view = await show(api);

    expect(view.textContent).toContain("size is not known");
    expect(button(view, /save notebook bundle/i).disabled).toBe(false);
  });
});
