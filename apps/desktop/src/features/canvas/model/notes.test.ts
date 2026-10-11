import type { CanvasFileModel } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { newCanvasFile } from "./canvasFiles";
import {
  NOTE_CARD,
  addNote,
  connectNodes,
  noteNodes,
  removeEdges,
  setNoteText,
} from "./notes";
import { pinResults } from "./nodes";

/**
 * ADR-0065: a question's canvas holds notes and figure cards. A line from a
 * note to a figure is the note's reference to it; nothing else may be joined.
 */

const QUESTION = "01JAXQ0000000000000000000A";
const EXP = "01JAXE000000000000000000A1";
const ART = "01JAXA000000000000000000A1";

let counter = 0;
const newId = () => `01JAXN${String(++counter).padStart(20, "0")}`;

const empty = (): CanvasFileModel => newCanvasFile(QUESTION, "Q-001 First");

/** A canvas with two notes and one figure card; returns their ids. */
function sample() {
  let file = empty();
  file = addNote(file, { x: 100, y: 100 }, newId);
  file = addNote(file, { x: 600, y: 100 }, newId);
  file = pinResults(
    file,
    [{ experimentId: EXP, artefactId: ART, version: 1 }],
    { x: 300, y: 400 },
    newId,
  );
  const [a, b, figure] = file.nodes.map((n) => n.id);
  return { file, a: a ?? "", b: b ?? "", figure: figure ?? "" };
}

describe("addNote", () => {
  it("adds an empty note centred on the point, at the default size", () => {
    const file = addNote(empty(), { x: 500, y: 300 }, newId);
    expect(file.nodes).toHaveLength(1);
    expect(file.nodes[0]).toMatchObject({
      type: "note",
      text: "",
      size: NOTE_CARD,
      position: {
        x: 500 - NOTE_CARD.width / 2,
        y: 300 - NOTE_CARD.height / 2,
      },
    });
  });

  it("keeps everything else in the file and does not change its input", () => {
    const base = { ...empty(), x_later: 1 };
    const next = addNote(base, { x: 0, y: 0 }, newId);
    expect(next).toMatchObject({ x_later: 1, name: "Q-001 First" });
    expect(base.nodes).toHaveLength(0);
  });
});

describe("setNoteText", () => {
  it("changes the text of a note", () => {
    const { file, a } = sample();
    const next = setNoteText(file, a, "Why is the dotplot flat?");
    expect(noteNodes(next)[0]?.text).toBe("Why is the dotplot flat?");
  });

  it("returns the file itself when the text is the same, or there is no such note", () => {
    const { file, a, figure } = sample();
    expect(setNoteText(file, a, "")).toBe(file);
    expect(setNoteText(file, "nope", "x")).toBe(file);
    expect(setNoteText(file, figure, "x")).toBe(file);
  });

  it("keeps line breaks and leading spaces exactly", () => {
    const { file, a } = sample();
    const text = "  one\n\n  two\n";
    expect(noteNodes(setNoteText(file, a, text))[0]?.text).toBe(text);
  });
});

describe("connectNodes", () => {
  it("joins a note to a figure with a line", () => {
    const { file, a, figure } = sample();
    const next = connectNodes(file, a, figure, newId);
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({ source: a, target: figure });
    expect(next.edges[0]).not.toHaveProperty("label");
  });

  it("joins a note to a note", () => {
    const { file, a, b } = sample();
    expect(connectNodes(file, a, b, newId).edges).toHaveLength(1);
  });

  it("joins a figure to a note dragged the other way, keeping the note as the source", () => {
    const { file, a, figure } = sample();
    const next = connectNodes(file, figure, a, newId);
    expect(next.edges[0]).toMatchObject({ source: a, target: figure });
  });

  it("refuses a figure to a figure, a node to itself, and anything missing", () => {
    const { file, a, figure } = sample();
    const two = pinResults(
      file,
      [{ experimentId: EXP, artefactId: ART, version: 1 }],
      { x: 0, y: 0 },
      newId,
    );
    const second = two.nodes.at(-1)?.id ?? "";
    expect(connectNodes(two, figure, second, newId)).toBe(two);
    expect(connectNodes(file, a, a, newId)).toBe(file);
    expect(connectNodes(file, a, "nope", newId)).toBe(file);
  });

  it("refuses a line that is already there, whichever way round it was drawn", () => {
    const { file, a, figure } = sample();
    const once = connectNodes(file, a, figure, newId);
    expect(connectNodes(once, a, figure, newId)).toBe(once);
    expect(connectNodes(once, figure, a, newId)).toBe(once);
  });

  it("does not join a region to anything", () => {
    const { file, a } = sample();
    const withRegion: CanvasFileModel = {
      ...file,
      nodes: [
        ...file.nodes,
        {
          id: "01JAXN00000000000000000099",
          type: "region",
          label: "Dose",
          position: { x: 0, y: 0 },
          size: { width: 100, height: 100 },
        },
      ],
    };
    expect(
      connectNodes(withRegion, a, "01JAXN00000000000000000099", newId),
    ).toBe(withRegion);
  });
});

describe("connectNodes remembers where the line was drawn", () => {
  it("keeps the side of each card, note first", () => {
    const { file, a, figure } = sample();
    const next = connectNodes(file, a, figure, newId, {
      from: "right",
      to: "left",
    });
    expect(next.edges[0]).toMatchObject({
      source: a,
      target: figure,
      source_handle: "right",
      target_handle: "left",
    });
  });

  it("swaps the sides with the cards when the line is drawn from the figure", () => {
    const { file, a, figure } = sample();
    const next = connectNodes(file, figure, a, newId, {
      from: "top",
      to: "bottom",
    });
    expect(next.edges[0]).toMatchObject({
      source: a,
      target: figure,
      source_handle: "bottom",
      target_handle: "top",
    });
  });

  it("leaves the sides out when none were given", () => {
    const { file, a, figure } = sample();
    const edge = connectNodes(file, a, figure, newId).edges[0];
    expect(edge).not.toHaveProperty("source_handle");
    expect(edge).not.toHaveProperty("target_handle");
  });
});

describe("removeEdges", () => {
  it("removes only the lines named", () => {
    const { file, a, b, figure } = sample();
    let next = connectNodes(file, a, figure, newId);
    next = connectNodes(next, a, b, newId);
    const [first, second] = next.edges.map((e) => e.id);
    const after = removeEdges(next, [first ?? ""]);
    expect(after.edges.map((e) => e.id)).toEqual([second]);
    expect(after.nodes).toHaveLength(3);
  });

  it("returns the file itself when no line is named", () => {
    const { file } = sample();
    expect(removeEdges(file, ["nope"])).toBe(file);
  });
});
