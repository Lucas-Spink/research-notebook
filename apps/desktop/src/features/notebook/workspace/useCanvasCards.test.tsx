import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolderHandle } from "../../../ipc/bindings";
import type { ArtefactNode, CardServices, FoundResult } from "../../canvas";
import { useCanvasCards, type OpenResult } from "./useCanvasCards";

const folder: FolderHandle = 1;

const node: ArtefactNode = {
  id: "01JAXN00000000000000000001",
  type: "artefact",
  position: { x: 0, y: 0 },
  size: { width: 240, height: 180 },
  experiment_id: "01JAXE000000000000000000A1",
  artefact_id: "01JAXA0000000000000000000A1",
};

const found: FoundResult = {
  status: "found",
  artefactId: node.artefact_id,
  name: "PCA plot",
  type: "image",
  experimentRef: "EXP-001",
  experimentTitle: "One",
  experimentFolder: "EXP-001",
  mode: "copy",
  shownVersion: 2,
  latestVersion: 2,
  fileName: "evidence/pca.png",
  sha256: "a".repeat(64),
  captured: true,
};

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

/** Mounts the hook and returns a function that re-renders it with a new handler. */
function mount(first: OpenResult) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let cards: CardServices | null = null;
  function Probe({ onOpen }: { onOpen: OpenResult }) {
    cards = useCanvasCards(null, folder, onOpen);
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root?.render(<Probe onOpen={first} />));
  return {
    cards: () => {
      if (cards === null) throw new Error("not rendered");
      return cards;
    },
    rerender: (next: OpenResult) =>
      act(() => root?.render(<Probe onOpen={next} />)),
  };
}

describe("useCanvasCards", () => {
  it("reports a card's result as missing until the notebook has loaded", () => {
    const view = mount(vi.fn());
    expect(view.cards().resolve(node)).toEqual({
      status: "missing",
      reason: "experiment",
    });
  });

  it("opens the original with the folder, artefact and version the card shows", () => {
    const open = vi.fn();
    const view = mount(open);
    view.cards().onOpen(found, node);
    expect(open).toHaveBeenCalledWith("EXP-001", node.artefact_id, 2);
  });

  it("calls the latest handler from cards built before it changed", () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = mount(first);
    const earlier = view.cards();
    view.rerender(second);
    earlier.onOpen(found, node);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
