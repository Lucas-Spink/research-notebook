import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { arrangedWithFigures, projectYaml } from "./model/fixtures";
import type { PdfExportApi } from "./model/pdfExport";
import { PdfExportPanel } from "./PdfExportPanel";
import { usePdfExport } from "./usePdfExport";

/** FR-ARC-06 from the person's side: opt in, then see whether the PDF was written. */

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

type Written = Awaited<ReturnType<PdfExportApi["writePdfExport"]>>;

function fakeApi(written: Written) {
  const writes: unknown[][] = [];
  const api: PdfExportApi = {
    appVersion: () => Promise.resolve("0.2.0"),
    readNotebookFile: () =>
      Promise.resolve({ status: "ok", data: { kind: "missing" } }),
    writePdfExport: (...args) => {
      writes.push(args);
      return Promise.resolve(written);
    },
  };
  return { api, writes };
}

/** The sample project with one citation whose source is not in the bibliography. */
function citingProject() {
  const arranged = arrangedWithFigures();
  const body = arranged.unassigned[0]?.experiment.file.body;
  if (body === undefined) throw new Error("fixture");
  body.sections = [{ key: "methods", body: "As before [@z:u:GONE2222]." }];
  return arranged;
}

function Harness(props: {
  api: PdfExportApi;
  writable?: boolean;
  loaded?: boolean;
  citing?: boolean;
}) {
  const loaded = props.loaded ?? true;
  const model = usePdfExport({
    api: props.api,
    folder: 1,
    arranged: loaded
      ? props.citing === true
        ? citingProject()
        : arrangedWithFigures()
      : null,
    project: loaded ? projectYaml() : null,
    writable: props.writable ?? true,
    formatBibliography: () =>
      Promise.resolve({
        entries: [],
        clusterTexts: [null],
        unresolved: ["z:u:GONE2222"],
      }),
    now: () => new Date("2026-10-09T12:00:00Z"),
  });
  return <PdfExportPanel model={model} />;
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

describe("PdfExportPanel", () => {
  it("writes nothing until asked", async () => {
    const { api, writes } = fakeApi({
      status: "ok",
      data: { kind: "written", figuresOmitted: 0 },
    });

    const view = await show({ api });

    expect(writes).toEqual([]);
    expect(view.textContent).toContain("has not been written yet");
    expect(button(view).disabled).toBe(false);
  });

  it("says where the PDF was written", async () => {
    const { api, writes } = fakeApi({
      status: "ok",
      data: { kind: "written", figuresOmitted: 0 },
    });
    const view = await show({ api });

    act(() => button(view).click());
    await flush();

    expect(writes).toHaveLength(1);
    expect(view.textContent).toContain(
      "exports/pdf/project-2026-10-09T12-00-00Z.pdf",
    );
    expect(view.textContent).toContain("written to");
    expect(button(view).textContent).toBe("Write again");
  });

  it("shows a failure and claims no file", async () => {
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
    expect(view.textContent).not.toContain("written to");
  });

  it("cannot be used on a read-only project", async () => {
    const { api, writes } = fakeApi({
      status: "ok",
      data: { kind: "written", figuresOmitted: 0 },
    });

    const view = await show({ api, writable: false });

    expect(button(view).disabled).toBe(true);
    expect(view.textContent).toContain("read-only");
    act(() => button(view).click());
    expect(writes).toEqual([]);
  });

  it("is not available while the project is loading", async () => {
    const { api } = fakeApi({
      status: "ok",
      data: { kind: "written", figuresOmitted: 0 },
    });
    const view = await show({ api, loaded: false });
    expect(button(view).disabled).toBe(true);
    expect(view.textContent).toContain("still loading");
  });

  it("names a cited source that is not in the bibliography", async () => {
    const { api } = fakeApi({
      status: "ok",
      data: { kind: "written", figuresOmitted: 0 },
    });
    const view = await show({ api, citing: true });

    act(() => button(view).click());
    await flush();

    expect(view.textContent).toContain("z:u:GONE2222");
    expect(view.textContent).toContain("not in the project's bibliography");
  });

  it("says how many figures could not be shown, so none is dropped silently", async () => {
    const { api } = fakeApi({
      status: "ok",
      data: { kind: "written", figuresOmitted: 2 },
    });
    const view = await show({ api });

    act(() => button(view).click());
    await flush();

    expect(view.textContent).toContain("2 figures were not included");
    expect(view.textContent).toContain("named in the document");
  });
});
