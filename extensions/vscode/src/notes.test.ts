import { describe, expect, it } from "vitest";

import { arrivalNote, IMPORT_NOTE } from "./notes";

describe("arrivalNote", () => {
  it("promises a quick import only when the project is open", () => {
    expect(arrivalNote("open")).toBe(IMPORT_NOTE);
  });

  it("says it waits for the next open when the project is closed or unclear", () => {
    expect(arrivalNote("closed")).toMatch(/next opened/);
    expect(arrivalNote("unknown")).toMatch(/next opened/);
  });
});
