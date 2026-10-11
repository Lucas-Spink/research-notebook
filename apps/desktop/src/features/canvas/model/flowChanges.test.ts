import type { NodeChange } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { newCanvasFile } from "./canvasFiles";
import { applyEdits, editsFrom, type CanvasEdit } from "./flowChanges";
import { pinResults } from "./nodes";

/**
 * React Flow reports every pixel of a drag. Only where a gesture ended is
 * worth keeping in the file, so a drag is one edit and not hundreds.
 */

const at = (id: string, x: number, y: number) => ({ id, position: { x, y } });

describe("editsFrom", () => {
  it("ignores a drag in progress and keeps where it ended", () => {
    const changes: NodeChange[] = [
      { id: "n1", type: "position", dragging: true, position: { x: 5, y: 5 } },
      { id: "n1", type: "position", dragging: true, position: { x: 9, y: 9 } },
      { id: "n1", type: "position", dragging: false },
    ];
    expect(editsFrom(changes, [at("n1", 9, 9)])).toEqual([
      { kind: "move", id: "n1", to: { x: 9, y: 9 } },
    ]);
  });

  it("takes the end position from the nodes as they now are, since the last change may not carry one", () => {
    const changes: NodeChange[] = [
      { id: "n1", type: "position", dragging: false },
    ];
    expect(editsFrom(changes, [at("n1", 40, 50)])).toEqual([
      { kind: "move", id: "n1", to: { x: 40, y: 50 } },
    ]);
  });

  it("keeps a resize only when it has finished", () => {
    const changes: NodeChange[] = [
      {
        id: "n1",
        type: "dimensions",
        resizing: true,
        dimensions: { width: 300, height: 200 },
      },
      {
        id: "n1",
        type: "dimensions",
        resizing: false,
        dimensions: { width: 320, height: 210 },
      },
    ];
    expect(editsFrom(changes, [])).toEqual([
      { kind: "resize", id: "n1", to: { width: 320, height: 210 } },
    ]);
  });

  it("ignores the measurements the library makes when a card first appears", () => {
    const changes: NodeChange[] = [
      { id: "n1", type: "dimensions", dimensions: { width: 360, height: 280 } },
    ];
    expect(editsFrom(changes, [])).toEqual([]);
  });

  it("ignores selection", () => {
    expect(
      editsFrom([{ id: "n1", type: "select", selected: true }], []),
    ).toEqual([]);
  });

  it("gathers removals into one edit", () => {
    const changes: NodeChange[] = [
      { id: "n1", type: "remove" },
      { id: "n2", type: "remove" },
    ];
    expect(editsFrom(changes, [])).toEqual([
      { kind: "remove", ids: ["n1", "n2"] },
    ]);
  });
});

describe("applyEdits", () => {
  const start = () =>
    pinResults(
      newCanvasFile("01JAXC0000000000000000CNV1", "C"),
      [
        {
          experimentId: "01JAXE000000000000000000A1",
          artefactId: "01JAXA000000000000000000A1",
          version: 1,
        },
      ],
      { x: 0, y: 0 },
      () => "01JAXN00000000000000000001",
    );

  it("applies each edit in turn", () => {
    const edits: CanvasEdit[] = [
      { kind: "move", id: "01JAXN00000000000000000001", to: { x: 7, y: 8 } },
      {
        kind: "resize",
        id: "01JAXN00000000000000000001",
        to: { width: 500, height: 400 },
      },
    ];
    const next = applyEdits(start(), edits);
    expect(next.nodes[0]).toMatchObject({
      position: { x: 7, y: 8 },
      size: { width: 500, height: 400 },
    });
  });

  it("returns the file itself when nothing changes", () => {
    const file = start();
    expect(applyEdits(file, [])).toBe(file);
    expect(
      applyEdits(file, [
        {
          kind: "move",
          id: "01JAXN00000000000000000001",
          to: file.nodes[0]?.position ?? { x: 0, y: 0 },
        },
      ]),
    ).toBe(file);
  });

  it("removes cards", () => {
    const next = applyEdits(start(), [
      { kind: "remove", ids: ["01JAXN00000000000000000001"] },
    ]);
    expect(next.nodes).toEqual([]);
  });
});
