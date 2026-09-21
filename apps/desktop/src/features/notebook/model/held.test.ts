import { describe, expect, it } from "vitest";
import { fakeChanges } from "./fakeApi";
import { holdFiles } from "./held";

describe("holdFiles", () => {
  it("holds every file that was read, from the hash it was read at", () => {
    const changes = fakeChanges();
    holdFiles(
      changes,
      {},
      { "_notebook/project.yaml": "a", "_notebook/questions/Q-001.md": "b" },
    );
    expect(Object.keys(changes.held).sort()).toEqual([
      "_notebook/project.yaml",
      "_notebook/questions/Q-001.md",
    ]);
    expect(changes.held["_notebook/project.yaml"]?.base).toBe("a");
  });

  it("lets go of a file that is no longer there", () => {
    const changes = fakeChanges();
    const before = {
      "_notebook/questions/Q-001.md": "a",
      "_notebook/questions/Q-002.md": "b",
    };
    holdFiles(changes, {}, before);
    holdFiles(changes, before, { "_notebook/questions/Q-001.md": "a" });
    expect(Object.keys(changes.held)).toEqual(["_notebook/questions/Q-001.md"]);
  });

  it("replaces the hash a file was held from, and clears anything left over from before", () => {
    const changes = fakeChanges();
    holdFiles(changes, {}, { "_notebook/project.yaml": "old" });
    changes.update("_notebook/project.yaml", (held) => ({
      ...held,
      saving: [{ sha256: "x", text: "t" }],
    }));
    holdFiles(
      changes,
      { "_notebook/project.yaml": "old" },
      { "_notebook/project.yaml": "new" },
    );
    expect(changes.held["_notebook/project.yaml"]).toEqual({
      path: "_notebook/project.yaml",
      base: "new",
      unsaved: null,
      saving: [],
      conflict: null,
    });
  });
});
