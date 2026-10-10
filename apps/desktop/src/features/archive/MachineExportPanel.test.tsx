import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MachineExportPanel } from "./MachineExportPanel";
import { arrangedWithFigures, projectYaml } from "./model/fixtures";
import type { MachineExportApi } from "./model/machineExport";
import { useMachineExport } from "./useMachineExport";

/** FR-ARC-07 from the person's side: opt in, then see what was written and what was not. */

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

type Written = Awaited<ReturnType<MachineExportApi["writeMachineExport"]>>;

function fakeApi(reply: (count: number) => Written) {
  const writes: unknown[][] = [];
  const api: MachineExportApi = {
    appVersion: () => Promise.resolve("0.2.0"),
    writeMachineExport: (...args) => {
      writes.push(args);
      return Promise.resolve(reply(args[1].length));
    },
  };
  return { api, writes };
}

const allWritten = (count: number): Written => ({
  status: "ok",
  data: new Array<"written">(count).fill("written"),
});

function Harness(props: {
  api: MachineExportApi;
  writable?: boolean;
  loaded?: boolean;
}) {
  const loaded = props.loaded ?? true;
  const model = useMachineExport({
    api: props.api,
    folder: 1,
    arranged: loaded ? arrangedWithFigures() : null,
    project: loaded ? projectYaml() : null,
    writable: props.writable ?? true,
    now: () => new Date("2026-10-09T12:00:00Z"),
  });
  return <MachineExportPanel model={model} />;
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

describe("MachineExportPanel", () => {
  it("writes nothing until asked", async () => {
    const { api, writes } = fakeApi(allWritten);

    const view = await show({ api });

    expect(writes).toEqual([]);
    expect(view.textContent).toContain("has not been written yet");
    expect(button(view).disabled).toBe(false);
  });

  it("says how many files were written and where", async () => {
    const { api, writes } = fakeApi(allWritten);
    const view = await show({ api });

    act(() => button(view).click());
    await flush();

    expect(writes).toHaveLength(1);
    expect(view.textContent).toContain("files written to exports/machine/");
    expect(button(view).textContent).toBe("Write again");
  });

  it("names a file that could not be written", async () => {
    const { api } = fakeApi((count) => ({
      status: "ok",
      data: Array.from({ length: count }, (_, i) =>
        i === 0 ? "writeFailed" : "written",
      ),
    }));
    const view = await show({ api });

    act(() => button(view).click());
    await flush();

    expect(view.querySelector("[role=alert]")?.textContent).toContain(
      "could not be written",
    );
  });

  it("shows a failure and claims no files", async () => {
    const { api } = fakeApi(() => ({
      status: "error",
      error: { kind: "notWritable" },
    }));
    const view = await show({ api });

    act(() => button(view).click());
    await flush();

    expect(view.querySelector("[role=alert]")?.textContent).toContain(
      "not open for writing",
    );
    expect(view.textContent).not.toContain("files written");
  });

  it("cannot be used on a read-only project", async () => {
    const { api, writes } = fakeApi(allWritten);

    const view = await show({ api, writable: false });

    expect(button(view).disabled).toBe(true);
    expect(view.textContent).toContain("read-only");
    act(() => button(view).click());
    expect(writes).toEqual([]);
  });

  it("is not available while the project is loading", async () => {
    const { api } = fakeApi(allWritten);
    const view = await show({ api, loaded: false });
    expect(button(view).disabled).toBe(true);
    expect(view.textContent).toContain("still loading");
  });
});
