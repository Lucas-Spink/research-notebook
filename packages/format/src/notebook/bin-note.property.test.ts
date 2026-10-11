import fc from "fast-check";
import { expect, it } from "vitest";
import { parseBinNote, serialiseBinNote } from "./bin-note";

it("a bin note reads back as written (ADR-0063)", () => {
  fc.assert(
    fc.property(
      fc.nat(1000),
      fc.array(fc.string({ minLength: 1 }), { maxLength: 20 }),
      (index, experiments) => {
        const note = { index, experiments };
        expect(parseBinNote(serialiseBinNote(note))).toEqual(note);
      },
    ),
  );
});
