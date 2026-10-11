import { describe, expect, it } from "vitest";
import { parseBinNote, serialiseBinNote } from "./bin-note";

describe("bin note (ADR-0063)", () => {
  it("reads back what was written", () => {
    const note = { index: 2, experiments: ["EXP-003", "EXP-001"] };
    expect(parseBinNote(serialiseBinNote(note))).toEqual(note);
  });

  it("ignores text that is not a note", () => {
    for (const text of [
      "",
      "not json",
      "[]",
      "{}",
      '{"version":2,"index":0,"experiments":[]}',
      '{"version":1,"index":-1,"experiments":[]}',
      '{"version":1,"index":1.5,"experiments":[]}',
      '{"version":1,"index":0,"experiments":[1]}',
    ]) {
      expect(parseBinNote(text)).toBeNull();
    }
  });
});
