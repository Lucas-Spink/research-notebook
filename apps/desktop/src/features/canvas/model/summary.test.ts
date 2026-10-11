import type { CanvasFileModel } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { newCanvasFile } from "./canvasFiles";
import { addNote, connectNodes, setNoteText } from "./notes";
import { pinResults, removeNodes, type ArtefactNode } from "./nodes";
import type { ResultInfo } from "./results";
import { summarise } from "./summary";

/**
 * ADR-0065: a question's notes, and the figures each refers to, read off the
 * lines on its canvas. Nothing here is stored; it is always what the canvas says.
 */

const QUESTION = "01JAXQ0000000000000000000A";
const EXP = "01JAXE000000000000000000A1";
const ART_1 = "01JAXA000000000000000000A1";
const ART_2 = "01JAXA000000000000000000A2";

let counter = 0;
const newId = () => `01JAXN${String(++counter).padStart(20, "0")}`;

const found = (id: string, name: string, version: number): ResultInfo => ({
  status: "found",
  artefactId: id,
  name,
  type: "image",
  experimentRef: "EXP-001",
  experimentTitle: "One",
  experimentFolder: "EXP-001",
  mode: "copy",
  shownVersion: version,
  latestVersion: version,
  fileName: "evidence/x.png",
  sha256: "a".repeat(64),
  captured: true,
});

const resolve = (node: ArtefactNode): ResultInfo =>
  node.artefact_id === ART_1
    ? found(ART_1, "PCA plot", node.version ?? 1)
    : node.artefact_id === ART_2
      ? found(ART_2, "Volcano", node.version ?? 1)
      : { status: "missing", reason: "artefact" };

const empty = (): CanvasFileModel => newCanvasFile(QUESTION, "Q-001 First");

describe("summarise", () => {
  it("is empty for a canvas with no notes, however many figures it holds", () => {
    const file = pinResults(
      empty(),
      [{ experimentId: EXP, artefactId: ART_1, version: 1 }],
      { x: 0, y: 0 },
      newId,
    );
    expect(summarise(file, resolve)).toEqual([]);
  });

  it("lists each note with its text and no references when nothing is joined to it", () => {
    let file = addNote(empty(), { x: 0, y: 0 }, newId);
    file = setNoteText(file, file.nodes[0]?.id ?? "", "Flat dotplot");
    expect(summarise(file, resolve)).toEqual([
      {
        id: file.nodes[0]?.id,
        text: "Flat dotplot",
        figures: [],
        notes: [],
      },
    ]);
  });

  it("lists the figures a note is joined to, by name, experiment and version", () => {
    let file = addNote(empty(), { x: 0, y: 0 }, newId);
    file = pinResults(
      file,
      [{ experimentId: EXP, artefactId: ART_1, version: 2 }],
      { x: 300, y: 0 },
      newId,
    );
    const [note, figure] = file.nodes.map((n) => n.id);
    file = connectNodes(file, note ?? "", figure ?? "", newId);
    const [entry] = summarise(file, resolve);
    expect(entry?.figures).toHaveLength(1);
    const reference = entry?.figures[0];
    expect(reference?.nodeId).toBe(figure);
    expect(reference?.info).toMatchObject({
      name: "PCA plot",
      experimentRef: "EXP-001",
      shownVersion: 2,
    });
  });

  it("reads a line the same from either end, and once if two cards of one figure are joined", () => {
    let file = addNote(empty(), { x: 0, y: 0 }, newId);
    file = pinResults(
      file,
      [
        { experimentId: EXP, artefactId: ART_1, version: 1 },
        { experimentId: EXP, artefactId: ART_1, version: 1 },
      ],
      { x: 300, y: 0 },
      newId,
    );
    const [note, one, two] = file.nodes.map((n) => n.id);
    file = connectNodes(file, one ?? "", note ?? "", newId);
    file = connectNodes(file, note ?? "", two ?? "", newId);
    const [entry] = summarise(file, resolve);
    expect(entry?.figures).toHaveLength(1);
  });

  it("keeps a figure that can no longer be found, saying so", () => {
    let file = addNote(empty(), { x: 0, y: 0 }, newId);
    file = pinResults(
      file,
      [{ experimentId: EXP, artefactId: "01JAXA000000000000000000Z9" }],
      { x: 300, y: 0 },
      newId,
    );
    const [note, figure] = file.nodes.map((n) => n.id);
    file = connectNodes(file, note ?? "", figure ?? "", newId);
    expect(summarise(file, resolve)[0]?.figures[0]?.info).toEqual({
      status: "missing",
      reason: "artefact",
    });
  });

  it("lists the notes a note is joined to, from either note", () => {
    let file = addNote(empty(), { x: 0, y: 0 }, newId);
    file = addNote(file, { x: 600, y: 0 }, newId);
    const [a, b] = file.nodes.map((n) => n.id);
    file = setNoteText(file, a ?? "", "first");
    file = setNoteText(file, b ?? "", "second");
    file = connectNodes(file, a ?? "", b ?? "", newId);
    const [first, second] = summarise(file, resolve);
    expect(first?.notes).toEqual([{ id: b, text: "second" }]);
    expect(second?.notes).toEqual([{ id: a, text: "first" }]);
  });

  it("orders notes down the canvas, then left to right, however they were made", () => {
    let file = addNote(empty(), { x: 800, y: 500 }, newId);
    file = addNote(file, { x: 100, y: 100 }, newId);
    file = addNote(file, { x: 500, y: 100 }, newId);
    const [low, topLeft, topRight] = file.nodes.map((n) => n.id);
    expect(summarise(file, resolve).map((n) => n.id)).toEqual([
      topLeft,
      topRight,
      low,
    ]);
  });

  it("forgets a figure whose card was removed, with its line", () => {
    let file = addNote(empty(), { x: 0, y: 0 }, newId);
    file = pinResults(
      file,
      [{ experimentId: EXP, artefactId: ART_2, version: 1 }],
      { x: 300, y: 0 },
      newId,
    );
    const [note, figure] = file.nodes.map((n) => n.id);
    file = connectNodes(file, note ?? "", figure ?? "", newId);
    file = removeNodes(file, [figure ?? ""]);
    expect(summarise(file, resolve)[0]?.figures).toEqual([]);
  });
});
