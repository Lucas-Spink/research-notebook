import { describe, expect, it } from "vitest";
import { newCanvasFile } from "./canvasFiles";
import {
  DEFAULT_CARD,
  MIN_CARD,
  FIT_LONGEST,
  artefactNodes,
  fitHeight,
  fitSize,
  isDefaultSize,
  moveNode,
  pinResults,
  pinnedIds,
  removeNodes,
  resizeNode,
  roundedViewport,
  setViewport,
  updatePinnedVersion,
  type PinRef,
} from "./nodes";

const CANVAS = "01JAXC0000000000000000CNV1";
const EXP_A = "01JAXE000000000000000000A1";
const ART_1 = "01JAXA0000000000000000000A1";
const ART_2 = "01JAXA0000000000000000000A2";

let counter = 0;
const newId = () => `01JAXN${String(++counter).padStart(20, "0")}`;
const empty = () => newCanvasFile(CANVAS, "Compare");
const ref = (artefactId: string, version?: number): PinRef => ({
  experimentId: EXP_A,
  artefactId,
  ...(version === undefined ? {} : { version }),
});

describe("pinResults", () => {
  it("adds a card for each result, centred on the point, at the default size", () => {
    const next = pinResults(
      empty(),
      [ref(ART_1, 2)],
      { x: 500, y: 400 },
      newId,
    );
    const [node] = next.nodes;
    expect(node).toMatchObject({
      type: "artefact",
      experiment_id: EXP_A,
      artefact_id: ART_1,
      version: 2,
      size: DEFAULT_CARD,
      position: {
        x: 500 - DEFAULT_CARD.width / 2,
        y: 400 - DEFAULT_CARD.height / 2,
      },
    });
  });

  it("leaves out the version of a link-mode result, which has none", () => {
    const next = pinResults(empty(), [ref(ART_1)], { x: 0, y: 0 }, newId);
    expect(next.nodes[0]).not.toHaveProperty("version");
  });

  it("cascades several results so none hides another", () => {
    const next = pinResults(
      empty(),
      [ref(ART_1, 1), ref(ART_2, 1)],
      { x: 0, y: 0 },
      newId,
    );
    const [a, b] = next.nodes;
    expect(a?.position).not.toEqual(b?.position);
  });

  it("lets the same result be pinned more than once", () => {
    const once = pinResults(empty(), [ref(ART_1, 1)], { x: 0, y: 0 }, newId);
    const twice = pinResults(once, [ref(ART_1, 1)], { x: 0, y: 0 }, newId);
    expect(artefactNodes(twice)).toHaveLength(2);
    const ids = twice.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("keeps everything else in the file, unknown keys included", () => {
    const base = { ...empty(), x_later: { a: 1 } };
    const next = pinResults(base, [ref(ART_1, 1)], { x: 0, y: 0 }, newId);
    expect(next).toMatchObject({ x_later: { a: 1 }, name: "Compare" });
    expect(base.nodes).toHaveLength(0);
  });

  it("changes nothing for an empty list", () => {
    const file = empty();
    expect(pinResults(file, [], { x: 0, y: 0 }, newId)).toBe(file);
  });
});

describe("pinnedIds", () => {
  it("lists the artefacts pinned, once each", () => {
    let file = pinResults(empty(), [ref(ART_1, 1)], { x: 0, y: 0 }, newId);
    file = pinResults(
      file,
      [ref(ART_1, 1), ref(ART_2, 1)],
      { x: 0, y: 0 },
      newId,
    );
    expect([...pinnedIds(file)].sort()).toEqual([ART_1, ART_2]);
  });
});

describe("moveNode and resizeNode", () => {
  const start = () =>
    pinResults(empty(), [ref(ART_1, 1)], { x: 0, y: 0 }, newId);

  it("moves a card, whole pixels", () => {
    const file = start();
    const id = file.nodes[0]?.id ?? "";
    const next = moveNode(file, id, { x: 10.4, y: -20.6 });
    expect(next.nodes[0]?.position).toEqual({ x: 10, y: -21 });
  });

  it("resizes a card but never below the minimum", () => {
    const file = start();
    const id = file.nodes[0]?.id ?? "";
    expect(
      resizeNode(file, id, { width: 500, height: 300 }).nodes[0]?.size,
    ).toEqual({ width: 500, height: 300 });
    expect(
      resizeNode(file, id, { width: 5, height: 5 }).nodes[0]?.size,
    ).toEqual(MIN_CARD);
  });

  it("leaves the file as it was when the card is not there, or nothing changed", () => {
    const file = start();
    const id = file.nodes[0]?.id ?? "";
    expect(moveNode(file, "nope", { x: 1, y: 1 })).toBe(file);
    expect(moveNode(file, id, file.nodes[0]?.position ?? { x: 0, y: 0 })).toBe(
      file,
    );
  });

  it("does not change its input", () => {
    const file = start();
    const before = JSON.stringify(file);
    moveNode(file, file.nodes[0]?.id ?? "", { x: 99, y: 99 });
    expect(JSON.stringify(file)).toBe(before);
  });
});

describe("removeNodes", () => {
  it("removes only the cards named, and the connectors that joined them", () => {
    let file = pinResults(
      empty(),
      [ref(ART_1, 1), ref(ART_2, 1)],
      { x: 0, y: 0 },
      newId,
    );
    const [a, b] = file.nodes.map((n) => n.id);
    file = {
      ...file,
      edges: [
        { id: "01JAXD0000000000000000000E1", source: a ?? "", target: b ?? "" },
      ],
    };
    const next = removeNodes(file, [a ?? ""]);
    expect(next.nodes.map((n) => n.id)).toEqual([b]);
    expect(next.edges).toEqual([]);
  });

  it("changes nothing for an id that is not on the canvas", () => {
    const file = pinResults(empty(), [ref(ART_1, 1)], { x: 0, y: 0 }, newId);
    expect(removeNodes(file, ["nope"])).toBe(file);
  });
});

describe("updatePinnedVersion", () => {
  it("moves one card to the version asked for and nothing else", () => {
    let file = pinResults(
      empty(),
      [ref(ART_1, 1), ref(ART_1, 1)],
      { x: 0, y: 0 },
      newId,
    );
    const first = file.nodes[0]?.id ?? "";
    file = updatePinnedVersion(file, first, 3);
    expect(file.nodes[0]).toMatchObject({ version: 3 });
    expect(file.nodes[1]).toMatchObject({ version: 1 });
  });

  it("does nothing to a card that is not a result", () => {
    const file = {
      ...empty(),
      nodes: [
        {
          id: "01JAXN00000000000000000001",
          type: "note" as const,
          text: "x",
          position: { x: 0, y: 0 },
          size: { width: 10, height: 10 },
        },
      ],
    };
    expect(updatePinnedVersion(file, "01JAXN00000000000000000001", 2)).toBe(
      file,
    );
  });
});

describe("viewport", () => {
  it("is rounded so a pan does not write noise", () => {
    expect(roundedViewport({ x: 10.49, y: -3.51, zoom: 0.123456 })).toEqual({
      x: 10,
      y: -4,
      zoom: 0.123,
    });
  });

  it("is set on the file, or left alone when it is the same", () => {
    const file = empty();
    const next = setViewport(file, { x: 5.2, y: 6.7, zoom: 2 });
    expect(next.viewport).toEqual({ x: 5, y: 7, zoom: 2 });
    expect(setViewport(next, { x: 5.2, y: 6.7, zoom: 2 })).toBe(next);
  });
});

describe("fitSize", () => {
  const CHROME = { width: 10, height: 56 };

  it("gives a landscape picture its own shape, the long side being the fit length", () => {
    expect(fitSize(4 / 3, CHROME)).toEqual({
      width: FIT_LONGEST + CHROME.width,
      height: Math.round(FIT_LONGEST / (4 / 3)) + CHROME.height,
    });
  });

  it("gives a portrait picture its own shape, the tall side being the fit length", () => {
    expect(fitSize(3 / 4, CHROME)).toEqual({
      width: Math.round(FIT_LONGEST * (3 / 4)) + CHROME.width,
      height: FIT_LONGEST + CHROME.height,
    });
  });

  it("gives a square picture a square picture area", () => {
    const size = fitSize(1, CHROME);
    expect(size.height - CHROME.height).toBe(size.width - CHROME.width);
  });

  it("never goes below the least a card may be", () => {
    const wide = fitSize(20, CHROME);
    expect(wide.width).toBeGreaterThanOrEqual(MIN_CARD.width);
    expect(wide.height).toBeGreaterThanOrEqual(MIN_CARD.height);
    const tall = fitSize(1 / 20, CHROME);
    expect(tall.width).toBeGreaterThanOrEqual(MIN_CARD.width);
  });

  it("is whole pixels", () => {
    const { width, height } = fitSize(1.618, CHROME);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });

  it("ignores an aspect it cannot use, keeping the default shape", () => {
    expect(fitSize(0, CHROME)).toEqual(DEFAULT_CARD);
    expect(fitSize(Number.NaN, CHROME)).toEqual(DEFAULT_CARD);
    expect(fitSize(Number.POSITIVE_INFINITY, CHROME)).toEqual(DEFAULT_CARD);
  });

  it("agrees with fitHeight: the height it gives is the one that fits its width", () => {
    for (const aspect of [0.6, 1, 1.5, 2.4]) {
      const size = fitSize(aspect, CHROME);
      expect(
        Math.abs(fitHeight(size.width, aspect, CHROME) - size.height),
      ).toBeLessThanOrEqual(1);
    }
  });
});

describe("fitHeight", () => {
  const CHROME = { width: 10, height: 56 };

  it("is the height that leaves a picture of this shape no empty space at the width", () => {
    expect(fitHeight(410, 2, CHROME)).toBe(200 + 56);
  });

  it("is never below the least a card may be", () => {
    expect(fitHeight(400, 100, CHROME)).toBe(MIN_CARD.height);
  });
});

describe("isDefaultSize", () => {
  it("is true only for the size a new card has", () => {
    expect(isDefaultSize({ ...DEFAULT_CARD })).toBe(true);
    expect(isDefaultSize({ width: 361, height: 280 })).toBe(false);
    expect(isDefaultSize({ width: 360, height: 281 })).toBe(false);
  });
});
