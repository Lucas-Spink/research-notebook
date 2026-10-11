import { describe, expect, it } from "vitest";
import { newCanvasFile } from "./canvasFiles";
import { toFlowEdges, toFlowNodes } from "./flowNodes";
import { pinResults } from "./nodes";
import type { ResultInfo } from "./results";

/** The canvas file's cards, as React Flow draws them. */

const file = pinResults(
  { ...newCanvasFile("01JAXC0000000000000000CNV1", "C"), nodes: [] },
  [
    {
      experimentId: "01JAXE000000000000000000A1",
      artefactId: "01JAXA000000000000000000A1",
      version: 2,
    },
  ],
  { x: 400, y: 300 },
  () => "01JAXN00000000000000000001",
);
const found: ResultInfo = {
  status: "found",
  artefactId: "01JAXA000000000000000000A1",
  name: "Plot",
  type: "image",
  experimentRef: "EXP-001",
  experimentTitle: "One",
  experimentFolder: "EXP-001",
  mode: "copy",
  shownVersion: 2,
  latestVersion: 2,
  fileName: "evidence/plot.png",
  sha256: "a".repeat(64),
  captured: true,
};

describe("toFlowNodes", () => {
  it("draws a result card at its place and size, carrying what it points at", () => {
    const [node] = toFlowNodes(file, () => found, new Set());
    expect(node).toMatchObject({
      id: "01JAXN00000000000000000001",
      type: "artefact",
      position: file.nodes[0]?.position,
      width: file.nodes[0]?.size.width,
      height: file.nodes[0]?.size.height,
      selected: false,
      data: { info: found },
    });
  });

  it("draws a card whose result is gone, with the reason", () => {
    const [node] = toFlowNodes(
      file,
      () => ({ status: "missing", reason: "version" }),
      new Set(),
    );
    expect(node?.data).toMatchObject({
      info: { status: "missing", reason: "version" },
    });
  });

  it("keeps the cards that were selected selected", () => {
    const [node] = toFlowNodes(
      file,
      () => found,
      new Set([file.nodes[0]?.id ?? ""]),
    );
    expect(node?.selected).toBe(true);
  });

  it("draws notes and regions too, so a canvas written by a later version is not lost", () => {
    const withOthers = {
      ...file,
      nodes: [
        ...file.nodes,
        {
          id: "01JAXN00000000000000000002",
          type: "note" as const,
          text: "Why flat?",
          position: { x: 0, y: 0 },
          size: { width: 200, height: 100 },
        },
        {
          id: "01JAXN00000000000000000003",
          type: "region" as const,
          label: "Dose",
          position: { x: 0, y: 0 },
          size: { width: 600, height: 400 },
        },
      ],
    };
    const nodes = toFlowNodes(withOthers, () => found, new Set());
    expect(nodes.map((n) => n.type)).toEqual(["artefact", "note", "region"]);
    expect(nodes[1]?.data).toMatchObject({ text: "Why flat?" });
    expect(nodes[2]?.data).toMatchObject({ label: "Dose" });
  });
});

describe("toFlowEdges", () => {
  it("draws a line from and to the sides it was drawn at", () => {
    const edges = toFlowEdges({
      ...file,
      edges: [
        {
          id: "01JAXD00000000000000000001",
          source: "a",
          target: "b",
          source_handle: "left",
          target_handle: "bottom",
        },
      ],
    });
    expect(edges).toEqual([
      {
        id: "01JAXD00000000000000000001",
        source: "a",
        target: "b",
        sourceHandle: "left",
        targetHandle: "bottom",
      },
    ]);
  });

  it("draws a line that has no sides between the sides of the two cards that face each other", () => {
    const at = (id: string, x: number, y: number) => ({
      id,
      type: "note" as const,
      text: "",
      position: { x, y },
      size: { width: 200, height: 100 },
    });
    const withEdge = (b: { x: number; y: number }) =>
      toFlowEdges({
        ...file,
        nodes: [at("a", 0, 0), at("b", b.x, b.y)],
        edges: [{ id: "01JAXD00000000000000000001", source: "a", target: "b" }],
      })[0];
    expect(withEdge({ x: 600, y: 10 })).toMatchObject({
      sourceHandle: "right",
      targetHandle: "left",
    });
    expect(withEdge({ x: -600, y: 10 })).toMatchObject({
      sourceHandle: "left",
      targetHandle: "right",
    });
    expect(withEdge({ x: 10, y: 600 })).toMatchObject({
      sourceHandle: "bottom",
      targetHandle: "top",
    });
    expect(withEdge({ x: 10, y: -600 })).toMatchObject({
      sourceHandle: "top",
      targetHandle: "bottom",
    });
  });

  it("keeps the side that was drawn when only one end has one", () => {
    const at = (id: string, x: number) => ({
      id,
      type: "note" as const,
      text: "",
      position: { x, y: 0 },
      size: { width: 200, height: 100 },
    });
    const [edge] = toFlowEdges({
      ...file,
      nodes: [at("a", 0), at("b", 600)],
      edges: [
        {
          id: "01JAXD00000000000000000001",
          source: "a",
          target: "b",
          source_handle: "bottom",
        },
      ],
    });
    expect(edge).toMatchObject({
      sourceHandle: "bottom",
      targetHandle: "left",
    });
  });
});
