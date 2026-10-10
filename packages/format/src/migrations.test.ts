import { describe, expect, it } from "vitest";
import { FORMAT_VERSION } from "./schema";
import {
  MIGRATIONS,
  planMigration,
  runMigration,
  type Migration,
  type MigrationFiles,
} from "./migrations";

/** Spec 5.13 rule 3 and 5: one pure step per version, run in order, never in place on an archive. */

const addOne: Migration = {
  from: 1,
  to: 2,
  run: (files) => ({ ...files, "a.txt": `${files["a.txt"] ?? ""}1` }),
};
const addTwo: Migration = {
  from: 2,
  to: 3,
  run: (files) => ({ ...files, "a.txt": `${files["a.txt"] ?? ""}2` }),
};

describe("planMigration", () => {
  it("is empty when the project is already at the target", () => {
    expect(planMigration(1, 1, [addOne, addTwo])).toEqual({
      ok: true,
      value: [],
    });
  });

  it("orders the steps from the old version to the target, whatever the table order", () => {
    const plan = planMigration(1, 3, [addTwo, addOne]);
    expect(plan).toEqual({ ok: true, value: [addOne, addTwo] });
  });

  it("refuses a project newer than the target", () => {
    expect(planMigration(4, 3, [addOne, addTwo])).toEqual({
      ok: false,
      error: { kind: "newer", found: 4, target: 3 },
    });
  });

  it("reports a gap in the chain instead of skipping it", () => {
    expect(planMigration(1, 3, [addTwo])).toEqual({
      ok: false,
      error: { kind: "gap", from: 1 },
    });
  });
});

describe("runMigration", () => {
  it("applies each step to the previous step's output and leaves the input alone", () => {
    const input: MigrationFiles = Object.freeze({ "a.txt": "x" });
    expect(runMigration(input, [addOne, addTwo])).toEqual({ "a.txt": "x12" });
    expect(input).toEqual({ "a.txt": "x" });
  });

  it("returns the files unchanged for an empty plan", () => {
    const input: MigrationFiles = { "a.txt": "x" };
    expect(runMigration(input, [])).toEqual(input);
  });
});

describe("the released table", () => {
  it("reaches the current version from every version it has", () => {
    expect(planMigration(FORMAT_VERSION, FORMAT_VERSION, MIGRATIONS).ok).toBe(
      true,
    );
    for (const step of MIGRATIONS) {
      expect(planMigration(step.from, FORMAT_VERSION, MIGRATIONS).ok).toBe(
        true,
      );
    }
  });
});
