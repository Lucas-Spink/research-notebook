import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { HtmlExportPanel } from "./HtmlExportPanel";
import { arrangedWithFigures } from "./model/fixtures";
import type { HtmlExportApi } from "./model/htmlExport";
import { useHtmlExport } from "./useHtmlExport";

/** FR-ARC-05 from the person's side: opt in, then see what was written and what was not. */

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

type Written = Awaited<ReturnType<HtmlExportApi["writeHtmlPages"]>>;

function fakeApi(written: Written) {
  const writes: unknown[][] = [];
  const api: HtmlExportApi = {
    prepareHtmlAssets: () =>
      Promise.resolve({
        status: "ok",
        data: [{ kind: "missing" }, { kind: "unsupported" }],
      }),
    writeHtmlPages: (...args) => {
      writes.push(args);
      return Promise.resolve(written);
    },
  };
  return { api, writes };
}

function Harness(props: {
  api: HtmlExportApi;
  writable?: boolean;
  loaded?: boolean;
}) {
  const loaded = props.loaded ?? true;
  const model = useHtmlExport({
    api: props.api,
    folder: 1,
    arranged: loaded ? arrangedWithFigures() : null,
    project: loaded ? { name: "Yeast", locale: "en-GB" } : null,
    writable: props.writable ?? true,
  });
  return <HtmlExportPanel model={model} />;
}

async function show(props: Parameters<typeof Harness>[0]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness {...props} />));
  await flush();
  return container;
}

function button(view: HTMLElement): HTMLButtonElement {
  const found = view.querySelector("button");
  if (!found) throw new Error("no button");
  return found;
}

describe("HtmlExportPanel", () => {
  it("writes nothing until asked", async () => {
    const { api, writes } = fakeApi({ status: "ok", data: [] });

    const view = await show({ api });

    expect(writes).toEqual([]);
    expect(view.textContent).toContain("has not been written yet");
    expect(button(view).disabled).toBe(false);
  });

  it("says how many pages were written and that some figures are only linked", async () => {
    const { api, writes } = fakeApi({
      status: "ok",
      data: ["written", "written"],
    });
    const view = await show({ api });

    act(() => button(view).click());
    await flush();

    expect(writes).toHaveLength(1);
    expect(view.textContent).toContain("2 pages written to exports/html/");
    expect(view.textContent).toContain(
      "1 figure or table could not be reduced",
    );
    expect(button(view).textContent).toBe("Write again");
  });

  it("names a page that could not be written", async () => {
    const { api } = fakeApi({
      status: "ok",
      data: ["writeFailed", "written"],
    });
    const view = await show({ api });

    act(() => button(view).click());
    await flush();

    expect(view.querySelector("[role=alert]")?.textContent).toContain(
      "EXP-001.html",
    );
  });

  it("shows a failure and claims no pages", async () => {
    const { api } = fakeApi({
      status: "error",
      error: { kind: "notWritable" },
    });
    const view = await show({ api });

    act(() => button(view).click());
    await flush();

    expect(view.querySelector("[role=alert]")?.textContent).toContain(
      "not open for writing",
    );
    expect(view.textContent).not.toContain("pages written");
  });

  it("cannot be run in a read-only project or before the project loads", async () => {
    const { api, writes } = fakeApi({ status: "ok", data: [] });

    const readOnly = await show({ api, writable: false });
    expect(button(readOnly).disabled).toBe(true);
    expect(readOnly.textContent).toContain("read-only");
    act(() => button(readOnly).click());
    await flush();
    expect(writes).toEqual([]);

    act(() => root?.unmount());
    readOnly.remove();
    const loading = await show({ api, loaded: false });
    expect(button(loading).disabled).toBe(true);
    expect(loading.textContent).toContain("still loading");
  });
});
