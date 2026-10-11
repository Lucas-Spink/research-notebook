import { describe, expect, it } from "vitest";
import {
  MIGRATIONS,
  planMigration,
  runMigration,
  type MigrationFiles,
} from "./migrations";

/** ADR-0064: the version 1 to 2 step changes only `format_version` in existing files. */

const PROJECT = "format_version: 1\nid: 01J00000000000000000000PRJ\nname: P\n";
const ARTEFACTS = "format_version: 1\nartefacts: []\ngroups: []\n";

function v1(): MigrationFiles {
  return {
    "_notebook/project.yaml": PROJECT,
    "_notebook/experiments/EXP-001/artefacts.yaml": ARTEFACTS,
    "_notebook/experiments/EXP-001/experiment.md": "---\nid: x\n---\n",
    "_notebook/questions/Q-001.md": "---\nid: y\n---\n",
    "_notebook/bibliography.json": "[]\n",
  };
}

describe("the version 1 to 2 migration", () => {
  const plan = planMigration(1, 2, MIGRATIONS);

  it("is registered as the step from 1 to 2", () => {
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.value.map((step) => [step.from, step.to])).toEqual([[1, 2]]);
    }
  });

  it("raises format_version in project.yaml and every artefacts.yaml", () => {
    if (!plan.ok) throw new Error("no plan");
    const out = runMigration(v1(), plan.value);
    expect(out["_notebook/project.yaml"]).toBe(
      PROJECT.replace("format_version: 1", "format_version: 2"),
    );
    expect(out["_notebook/experiments/EXP-001/artefacts.yaml"]).toBe(
      ARTEFACTS.replace("format_version: 1", "format_version: 2"),
    );
  });

  it("leaves every other file exactly as it was", () => {
    if (!plan.ok) throw new Error("no plan");
    const input = v1();
    const out = runMigration(input, plan.value);
    for (const path of [
      "_notebook/experiments/EXP-001/experiment.md",
      "_notebook/questions/Q-001.md",
      "_notebook/bibliography.json",
    ]) {
      expect(out[path]).toBe(input[path]);
    }
  });

  it("keeps CRLF line endings and a byte-order mark", () => {
    if (!plan.ok) throw new Error("no plan");
    const crlf = "﻿format_version: 1\r\nid: x\r\n";
    const out = runMigration({ "_notebook/project.yaml": crlf }, plan.value);
    expect(out["_notebook/project.yaml"]).toBe(
      "﻿format_version: 2\r\nid: x\r\n",
    );
  });

  it("changes only the first-level key, not a look-alike inside a value", () => {
    if (!plan.ok) throw new Error("no plan");
    const text =
      "format_version: 1\nname: 'format_version: 1'\nnote: |\n  format_version: 1\n";
    const out = runMigration({ "_notebook/project.yaml": text }, plan.value);
    expect(out["_notebook/project.yaml"]).toBe(
      "format_version: 2\nname: 'format_version: 1'\nnote: |\n  format_version: 1\n",
    );
  });

  it("does not touch a file already at version 2", () => {
    if (!plan.ok) throw new Error("no plan");
    const done = { "_notebook/project.yaml": "format_version: 2\nid: x\n" };
    expect(runMigration(done, plan.value)).toEqual(done);
  });

  it("is idempotent and does not change its input", () => {
    if (!plan.ok) throw new Error("no plan");
    const input = Object.freeze(v1());
    const once = runMigration(input, plan.value);
    expect(runMigration(once, plan.value)).toEqual(once);
    expect(input).toEqual(v1());
  });

  it("adds no files, so a migrated project has no canvases yet", () => {
    if (!plan.ok) throw new Error("no plan");
    const input = v1();
    expect(Object.keys(runMigration(input, plan.value)).sort()).toEqual(
      Object.keys(input).sort(),
    );
  });
});
