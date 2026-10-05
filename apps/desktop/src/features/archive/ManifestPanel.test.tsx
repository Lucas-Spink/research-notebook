import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ManifestPanel } from "./ManifestPanel";
import type { ManifestApi } from "./model/generate";
import { arranged as sample } from "./model/fixtures";
import { useManifest } from "./useManifest";

/** FR-ARC-02 from the person's side: generate the manifest and see what it did and did not cover. */

const HASH = "a".repeat(64);
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

type Written = Awaited<ReturnType<ManifestApi["writeManifest"]>>;

function fakeApi(
  options: { missingSecond?: boolean; written?: Written } = {},
): { api: ManifestApi; written: string[] } {
  const written: string[] = [];
  const api: ManifestApi = {
    observeVersionFiles: () =>
      Promise.resolve({
        status: "ok",
        data: [
          { kind: "observed", size: 3, modifiedMs: 0, sha256: HASH },
          options.missingSecond === true
            ? { kind: "missing" }
            : { kind: "observed", size: 3, modifiedMs: 0, sha256: HASH },
        ],
      }),
    writeManifest: (_folder, csv) => {
      written.push(csv);
      return Promise.resolve(options.written ?? { status: "ok", data: null });
    },
  };
  return { api, written };
}

function Harness(props: {
  api: ManifestApi;
  writable?: boolean;
  integrityOpen?: number | null;
}) {
  const model = useManifest({
    api: props.api,
    folder: 1,
    arranged: sample(),
    writable: props.writable ?? true,
  });
  return (
    <ManifestPanel
      model={model}
      integrityOpen={
        props.integrityOpen === undefined ? 0 : props.integrityOpen
      }
    />
  );
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
  const found = [...view.querySelectorAll("button")].find((b) =>
    /generate|writing/i.test(b.textContent),
  );
  if (!found) throw new Error("no button");
  return found;
}

async function generate(view: HTMLElement) {
  act(() => button(view).click());
  await flush();
}

describe("ManifestPanel", () => {
  it("writes nothing until asked", async () => {
    const { api, written } = fakeApi();
    const view = await show({ api });
    expect(written).toEqual([]);
    expect(view.textContent).toContain("has not been generated");
  });

  it("generates the manifest and says how many files it lists", async () => {
    const { api, written } = fakeApi();
    const view = await show({ api });

    await generate(view);

    expect(written).toHaveLength(1);
    expect(view.querySelector("[role=status]")?.textContent).toContain(
      "2 files",
    );
    expect(view.textContent).toContain("Generate again");
  });

  it("lists a file it could not describe", async () => {
    const { api } = fakeApi({ missingSecond: true });
    const view = await show({ api });

    await generate(view);

    expect(view.querySelector("[role=status]")?.textContent).toContain(
      "1 file",
    );
    expect(view.textContent).toContain(
      "_notebook/experiments/EXP-001/evidence/plot.v2.pdf",
    );
    expect(view.textContent).toContain("not found");
  });

  it("warns when the integrity check has findings open or has not been run", async () => {
    const { api } = fakeApi();
    const open = await show({ api, integrityOpen: 3 });
    expect(open.textContent).toContain("3 findings");
    act(() => root?.unmount());
    container?.remove();
    const unrun = await show({ api, integrityOpen: null });
    expect(unrun.textContent).toContain("has not been run");
  });

  it("does not offer to generate in a read-only project", async () => {
    const { api, written } = fakeApi();
    const view = await show({ api, writable: false });

    expect(button(view).disabled).toBe(true);
    expect(view.textContent).toContain("read-only");
    expect(written).toEqual([]);
  });

  it("tells the person when nothing could be written", async () => {
    const { api } = fakeApi({
      written: { status: "error", error: { kind: "writeFailed" } },
    });
    const view = await show({ api });

    await generate(view);

    expect(view.querySelector("[role=alert]")?.textContent).toContain(
      "could not be written",
    );
  });
});
