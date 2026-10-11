import type { CanvasFileModel } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { newCanvasFile } from "./canvasFiles";
import {
  citeTrigger,
  notesCitekeys,
  readableCitations,
  spliceCitation,
} from "./cite";

/**
 * Typing /cite in a note opens the citation picker where the words were, as in
 * a section, and what the picker composes is put back at that place.
 */

describe("citeTrigger", () => {
  it("finds /cite just before the caret", () => {
    expect(citeTrigger("As shown /cite", 14)).toEqual({ start: 9, end: 14 });
  });

  it("finds it at the very start of the note", () => {
    expect(citeTrigger("/cite", 5)).toEqual({ start: 0, end: 5 });
  });

  it("finds it after a line break", () => {
    expect(citeTrigger("one\n/cite", 9)).toEqual({ start: 4, end: 9 });
  });

  it("finds it in the middle of a note, the caret being just after it", () => {
    expect(citeTrigger("see /cite and more", 9)).toEqual({ start: 4, end: 9 });
  });

  it("is nothing when the words are part of another word or path", () => {
    expect(citeTrigger("a/cite", 6)).toBeNull();
    expect(citeTrigger("http://x/cite", 13)).toBeNull();
  });

  it("is nothing when the caret is not just after it, or something is typed after", () => {
    expect(citeTrigger("/cite", 3)).toBeNull();
    expect(citeTrigger("/cites", 6)).toBeNull();
    expect(citeTrigger("/cit", 4)).toBeNull();
  });

  it("is case sensitive, as the slash command is", () => {
    expect(citeTrigger("/Cite", 5)).toBeNull();
  });
});

describe("spliceCitation", () => {
  it("puts the citation at the place, with the caret after it", () => {
    expect(spliceCitation("As shown ", 9, "[@z:u:7XK2PQ9M]")).toEqual({
      text: "As shown [@z:u:7XK2PQ9M]",
      caret: 24,
    });
  });

  it("keeps what comes after", () => {
    expect(spliceCitation("As  is flat", 3, "[@z:u:7XK2PQ9M]")).toEqual({
      text: "As [@z:u:7XK2PQ9M] is flat",
      caret: 18,
    });
  });

  it("puts it at the end when the place is past the end", () => {
    expect(spliceCitation("short", 99, "[@z:u:7XK2PQ9M]").text).toBe(
      "short[@z:u:7XK2PQ9M]",
    );
  });
});

describe("readableCitations", () => {
  const label = (key: string) =>
    ({ "z:u:7XK2PQ9M": "Smith 2020", "z:g4521:ABCD2345": "Lee et al. 2019" })[
      key
    ] ?? null;

  it("shows a cited source by its author and year", () => {
    expect(readableCitations("Flat [@z:u:7XK2PQ9M].", label)).toBe(
      "Flat [Smith 2020].",
    );
  });

  it("keeps a prefix, locator and suffix, and several sources", () => {
    expect(
      readableCitations(
        "[see @z:u:7XK2PQ9M, fig. 2; @z:g4521:ABCD2345]",
        label,
      ),
    ).toBe("[see Smith 2020, fig. 2; Lee et al. 2019]");
  });

  it("keeps the suppress-author form marked", () => {
    expect(readableCitations("[-@z:u:7XK2PQ9M]", label)).toBe("[-Smith 2020]");
  });

  it("leaves the key in place when the source is not cached", () => {
    expect(readableCitations("[@z:u:ZZZZ2222]", label)).toBe("[@z:u:ZZZZ2222]");
  });

  it("leaves text without a citation exactly as it is", () => {
    const text = "An email a@b.c and [a link](x) and [not a citation].";
    expect(readableCitations(text, label)).toBe(text);
  });
});

describe("notesCitekeys", () => {
  const note = (text: string) =>
    ({
      id: "n",
      type: "note",
      position: { x: 0, y: 0 },
      size: { width: 1, height: 1 },
      text,
    }) as unknown as CanvasFileModel["nodes"][number];
  const file = (...texts: string[]) =>
    ({ ...newCanvasFile("Q", "Q"), nodes: texts.map(note) }) as CanvasFileModel;

  it("collects the keys cited in notes of every canvas, once", () => {
    const keys = notesCitekeys([
      file("a [@z:u:7XK2PQ9M] b", "none"),
      file("[@z:u:7XK2PQ9M; @z:u:ABCDEFGH]"),
      null,
    ]);
    expect([...keys].sort()).toEqual(["z:u:7XK2PQ9M", "z:u:ABCDEFGH"]);
  });
});
