import { describe, expect, it } from "vitest";
import type { FormatError, Result } from "../result";
import { parseCanvas, serialiseCanvas } from "./canvas";

/** ADR-0064: canvas files are canonical JSON, validated here and nowhere else. */

const CANVAS = "01JABCDEFGHJKMNPQRSTVWXYZ0";
const NODE_A = "01JNODEA00000000000000000A".replace("O", "0");
const NODE_B = "01JNODEB00000000000000000B".replace("O", "0");
const EXPERIMENT = "01J00000000000000000000EXP";
const ARTEFACT = "01J00000000000000000000ART";
const EDGE = "01J00000000000000000000EDG";

function base(): Record<string, unknown> {
  return {
    format_version: 2,
    id: CANVAS,
    name: "Figure 2 draft",
    nodes: [
      {
        id: NODE_A,
        type: "artefact",
        experiment_id: EXPERIMENT,
        artefact_id: ARTEFACT,
        version: 1,
        position: { x: 240, y: 180 },
        size: { width: 360, height: 260 },
      },
      {
        id: NODE_B,
        type: "note",
        text: "Why is the dotplot flat?",
        position: { x: 700, y: 180 },
        size: { width: 240, height: 120 },
      },
    ],
    edges: [{ id: EDGE, source: NODE_A, target: NODE_B, label: "supports" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

type Obj = Record<string, unknown>;

function listOf(file: Obj, key: "nodes" | "edges"): Obj[] {
  const list = file[key];
  if (!Array.isArray(list)) throw new Error(`${key} is not a list`);
  return list as Obj[];
}

function at(list: Obj[], index: number): Obj {
  const item = list[index];
  if (item === undefined) throw new Error(`no item ${index}`);
  return item;
}

function text(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorOf(result: Result<unknown>): FormatError {
  if (result.ok) throw new Error("expected the file to be rejected");
  return result.error;
}

function messageFor(mutate: (file: Record<string, unknown>) => void): string {
  const file = base();
  mutate(file);
  return errorOf(parseCanvas(text(file))).message;
}

describe("parseCanvas", () => {
  it("reads a valid canvas", () => {
    const parsed = parseCanvas(text(base()));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.name).toBe("Figure 2 draft");
      expect(parsed.value.nodes).toHaveLength(2);
    }
  });

  it("reads an empty canvas", () => {
    const file = { ...base(), nodes: [], edges: [] };
    expect(parseCanvas(text(file)).ok).toBe(true);
  });

  it("accepts format version 2 and reports a newer one as unsupported", () => {
    const newer = errorOf(parseCanvas(text({ ...base(), format_version: 3 })));
    expect(newer.kind).toBe("unsupported-version");
  });

  it("rejects version 1, which never held canvases", () => {
    expect(
      errorOf(parseCanvas(text({ ...base(), format_version: 1 }))).kind,
    ).toBe("schema");
  });

  it("rejects invalid JSON with a syntax error", () => {
    expect(errorOf(parseCanvas("{ not json")).kind).toBe("syntax");
  });

  it("keeps unknown keys on the file and on nodes", () => {
    const file = base();
    file["x_future"] = { a: 1 };
    at(listOf(file, "nodes"), 0)["x_pin"] = true;
    const parsed = parseCanvas(text(file));
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(serialiseCanvas(parsed.value)).toContain('"x_future"');
    expect(serialiseCanvas(parsed.value)).toContain('"x_pin"');
  });

  it("rejects a repeated node id", () => {
    expect(
      messageFor((file) => {
        at(listOf(file, "nodes"), 1)["id"] = NODE_A;
      }),
    ).toMatch(/node id is used more than once/);
  });

  it("rejects a repeated edge id", () => {
    expect(
      messageFor((file) => {
        const edges = listOf(file, "edges");
        edges.push({ ...at(edges, 0) });
      }),
    ).toMatch(/edge id is used more than once/);
  });

  it("rejects an edge that names a node that is not on the canvas", () => {
    expect(
      messageFor((file) => {
        at(listOf(file, "edges"), 0)["target"] = EXPERIMENT;
      }),
    ).toMatch(/not a node on this canvas/);
  });

  it("rejects an unknown relationship label", () => {
    expect(
      messageFor((file) => {
        at(listOf(file, "edges"), 0)["label"] = "agrees-with";
      }),
    ).toBeTruthy();
  });

  it.each([
    ["a zero width", { width: 0, height: 10 }],
    ["a negative height", { width: 10, height: -1 }],
  ])("rejects %s", (_name, size) => {
    expect(
      messageFor((file) => {
        at(listOf(file, "nodes"), 0)["size"] = size;
      }),
    ).toBeTruthy();
  });

  it("rejects a non-positive zoom", () => {
    expect(
      messageFor((file) => {
        file["viewport"] = { x: 0, y: 0, zoom: 0 };
      }),
    ).toBeTruthy();
  });

  it("rejects an artefact version below 1", () => {
    expect(
      messageFor((file) => {
        at(listOf(file, "nodes"), 0)["version"] = 0;
      }),
    ).toBeTruthy();
  });

  it("rejects an unknown node type", () => {
    expect(
      messageFor((file) => {
        at(listOf(file, "nodes"), 1)["type"] = "sticker";
      }),
    ).toBeTruthy();
  });

  it("rejects a name with a line break", () => {
    expect(
      messageFor((file) => {
        file["name"] = "two\nlines";
      }),
    ).toBeTruthy();
  });
});

describe("serialiseCanvas", () => {
  it("writes canonical key order, two-space indent and one final newline", () => {
    const shuffled = {
      viewport: { zoom: 1, y: 0, x: 0 },
      edges: [],
      nodes: [
        {
          size: { height: 5, width: 6 },
          position: { y: 2, x: 1 },
          type: "region",
          label: "Group",
          id: NODE_A,
        },
      ],
      name: "N",
      id: CANVAS,
      format_version: 2,
    };
    const parsed = parseCanvas(text(shuffled));
    if (!parsed.ok) throw new Error(parsed.error.message);
    const out = serialiseCanvas(parsed.value);
    expect(out.endsWith("}\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
    const keys = Object.keys(JSON.parse(out) as object);
    expect(keys).toEqual([
      "format_version",
      "id",
      "name",
      "nodes",
      "edges",
      "viewport",
    ]);
    const node = at((JSON.parse(out) as { nodes: Obj[] }).nodes, 0);
    expect(Object.keys(node)).toEqual([
      "id",
      "type",
      "label",
      "position",
      "size",
    ]);
    expect(Object.keys(node["size"] as Obj)).toEqual(["width", "height"]);
  });

  it("reproduces a canonical file byte for byte", () => {
    const canonical = text(base());
    const parsed = parseCanvas(canonical);
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(serialiseCanvas(parsed.value)).toBe(canonical);
  });
});
