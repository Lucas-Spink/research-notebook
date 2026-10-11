import { parseCanvas } from "@research-notebook/format";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CanvasView } from "./CanvasView";
import {
  A,
  FOLDER,
  fakeApi,
  pathOf,
  textOf,
  textWithCard,
} from "./model/fakeApi";
import type { CanvasApi } from "./model/store";
import {
  buttonNamed,
  click,
  fakeCards,
  flush,
  foundResult,
  mount,
  stubFlowEnvironment,
  unmount,
} from "./testSupport";
import { useCanvases, type CanvasesModel } from "./useCanvases";

/**
 * ADR-0064, phase 2: result cards on the canvas. Pinning refers to a result and
 * never copies or moves it; cards move, resize and are removed without
 * touching the result; a card never advances to a newer version by itself;
 * and the layout is saved after a pause.
 */

beforeAll(stubFlowEnvironment);
afterEach(unmount);

const EXP = "01JAXE000000000000000000A1";
const ART = "01JAXA000000000000000000A1";
const ART_2 = "01JAXA000000000000000000A2";

let model: CanvasesModel | null = null;

function Harness({
  api,
  cards,
  writable = true,
}: {
  api: CanvasApi;
  cards: ReturnType<typeof fakeCards>;
  writable?: boolean;
}) {
  const canvases = useCanvases({
    api,
    folder: FOLDER,
    writable,
    enabled: true,
    saveDelayMs: 0,
  });
  model = canvases;
  return <CanvasView canvases={canvases} cards={cards} />;
}

async function open(
  files: Record<string, string>,
  answers: Parameters<typeof fakeCards>[0] = {},
  writable = true,
) {
  const fake = fakeApi(files);
  const cards = fakeCards(answers);
  const view = mount(
    <Harness api={fake.api} cards={cards} writable={writable} />,
  );
  await flush();
  return { view, cards, ...fake };
}

const saved = (disk: Record<string, string>) => {
  const parsed = parseCanvas(disk[pathOf(A)] ?? "");
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
};

const withCard = (version: number | undefined) =>
  textWithCard(A, "Compare", {
    experimentId: EXP,
    artefactId: ART,
    ...(version === undefined ? {} : { version }),
  });

describe("pinning results", () => {
  it("puts a card on the canvas where the result was dropped, and saves the canvas after a pause", async () => {
    const found = foundResult();
    const { view, disk } = await open(
      { [pathOf(A)]: textOf(A, "Compare") },
      { [ART]: found },
    );
    expect(view.textContent).toContain("Drag a result here");
    act(() => {
      model?.pinAt([{ experimentId: EXP, artefactId: ART, version: 1 }], {
        x: 500,
        y: 400,
      });
    });
    await flush();
    expect(view.textContent).toContain("PCA plot");
    expect(view.textContent).toContain("EXP-001");
    const file = saved(disk);
    expect(file.nodes).toHaveLength(1);
    expect(file.nodes[0]).toMatchObject({
      type: "artefact",
      experiment_id: EXP,
      artefact_id: ART,
      version: 1,
    });
  });

  it("marks the result as pinned for the results list", async () => {
    await open({ [pathOf(A)]: textOf(A, "Compare") }, { [ART]: foundResult() });
    expect(model?.pinned.has(ART)).toBe(false);
    act(() => {
      model?.pinAt([{ experimentId: EXP, artefactId: ART, version: 1 }], null);
    });
    await flush();
    expect(model?.pinned.has(ART)).toBe(true);
  });

  it("lets the same result be pinned twice, as two cards", async () => {
    const { disk } = await open(
      { [pathOf(A)]: textOf(A, "Compare") },
      { [ART]: foundResult() },
    );
    for (const x of [100, 600]) {
      act(() => {
        model?.pinAt([{ experimentId: EXP, artefactId: ART, version: 1 }], {
          x,
          y: 200,
        });
      });
    }
    await flush();
    expect(saved(disk).nodes).toHaveLength(2);
  });

  it("pins nothing, and says why, when the project is read-only", async () => {
    const { view, writes } = await open(
      { [pathOf(A)]: textOf(A, "Compare") },
      { [ART]: foundResult() },
      false,
    );
    act(() => {
      model?.pinAt([{ experimentId: EXP, artefactId: ART }], null);
    });
    await flush();
    expect(view.textContent).toContain("read-only");
    expect(writes).toEqual([]);
  });

  it("pins nothing, and says so, when there is no canvas to pin to", async () => {
    const { view, writes } = await open({}, { [ART]: foundResult() });
    act(() => {
      model?.pinAt([{ experimentId: EXP, artefactId: ART }], null);
    });
    await flush();
    expect(view.textContent).toContain("Nothing was pinned");
    expect(writes).toEqual([]);
  });
});

describe("result cards", () => {
  it("show the result, its experiment and the version pinned", async () => {
    const { view } = await open(
      { [pathOf(A)]: withCard(1) },
      { [ART]: foundResult({ shownVersion: 1, latestVersion: 1 }) },
    );
    await flush();
    expect(view.textContent).toContain("picture of PCA plot");
    expect(view.textContent).toContain("EXP-001");
    expect(view.textContent).toContain("v1");
    expect(view.textContent).not.toContain("is available");
  });

  it("say when a newer version exists, and move to it only when asked", async () => {
    const { view, disk } = await open(
      { [pathOf(A)]: withCard(1) },
      { [ART]: foundResult({ shownVersion: 1, latestVersion: 3 }) },
    );
    await flush();
    expect(view.textContent).toContain("v3 is available");
    // Nothing has been written just because a newer version exists.
    expect(saved(disk).nodes[0]).toMatchObject({ version: 1 });
    click(buttonNamed(view, "Update to v3"));
    await flush();
    expect(saved(disk).nodes[0]).toMatchObject({ version: 3 });
  });

  it("open the original in the preview pane", async () => {
    const { view, cards } = await open(
      { [pathOf(A)]: withCard(1) },
      { [ART]: foundResult({ shownVersion: 1 }) },
    );
    await flush();
    const open_ = view.querySelector('button[aria-label="Open PCA plot"]');
    click(open_);
    expect(cards.opened).toEqual([[ART, 1]]);
  });

  it("can be removed from the canvas, which changes only the canvas file", async () => {
    const { view, disk, trashed } = await open(
      { [pathOf(A)]: withCard(1) },
      { [ART]: foundResult() },
    );
    await flush();
    click(view.querySelector('button[aria-label="Remove from canvas"]'));
    await flush();
    expect(saved(disk).nodes).toEqual([]);
    expect(view.textContent).not.toContain("picture of PCA plot");
    expect(trashed).toEqual([]);
    expect(Object.keys(disk)).toEqual([pathOf(A)]);
  });

  it("stay, saying what was lost, when the result cannot be found", async () => {
    const { view, disk } = await open(
      { [pathOf(A)]: withCard(2) },
      { [ART]: { status: "missing", reason: "version" } },
    );
    await flush();
    expect(view.textContent).toContain("Result not available");
    expect(view.textContent).toContain("no longer one of its versions");
    expect(saved(disk).nodes).toHaveLength(1);
    click(view.querySelector('button[aria-label="Remove from canvas"]'));
    await flush();
    expect(saved(disk).nodes).toHaveLength(0);
  });

  it("cannot be removed or updated when the project is read-only", async () => {
    const { view } = await open(
      { [pathOf(A)]: withCard(1) },
      { [ART]: foundResult({ shownVersion: 1, latestVersion: 2 }) },
      false,
    );
    await flush();
    expect(
      view.querySelector('button[aria-label="Remove from canvas"]'),
    ).toBeNull();
    expect(
      [...view.querySelectorAll("button")].some((b) =>
        b.textContent?.startsWith("Update to"),
      ),
    ).toBe(false);
  });
});

describe("saving the layout", () => {
  it("does not write a canvas that nothing was done to", async () => {
    const { writes } = await open(
      { [pathOf(A)]: withCard(1) },
      { [ART]: foundResult() },
    );
    await flush();
    expect(writes).toEqual([]);
  });

  it("flushes edits at once on request, as when the table takes over", async () => {
    const fake = fakeApi({ [pathOf(A)]: textOf(A, "Compare") });
    const cards = fakeCards({ [ART_2]: foundResult({ artefactId: ART_2 }) });
    function Slow() {
      const canvases = useCanvases({
        api: fake.api,
        folder: FOLDER,
        writable: true,
        enabled: true,
        saveDelayMs: 60_000,
      });
      model = canvases;
      return <CanvasView canvases={canvases} cards={cards} />;
    }
    mount(<Slow />);
    await flush();
    act(() => {
      model?.pinAt(
        [{ experimentId: EXP, artefactId: ART_2, version: 1 }],
        null,
      );
    });
    await flush();
    expect(fake.writes).toEqual([]);
    await act(async () => {
      await model?.flush();
    });
    expect(fake.writes).toEqual([pathOf(A)]);
  });
});
