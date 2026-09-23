import { describe, expect, it } from "vitest";
import { must, testEnv } from "../../test/notebook-support";
import type { ArtefactsFileModel } from "../schema";
import {
  addToGroup,
  createGroup,
  deleteGroup,
  moveGroup,
  moveToGroup,
  removeFromGroup,
  renameGroup,
  reorderItem,
  ungroupedArtefacts,
} from "./groups";

const R1 = "01JB0000000000000000000001";
const R2 = "01JB0000000000000000000002";
const R3 = "01JB0000000000000000000003";
const M1 = "01JB0000000000000000000009";
const GA = "01JC000000000000000000000A";
const GB = "01JC000000000000000000000B";
const GC = "01JC000000000000000000000C";

function artefact(id: string, role: "result" | "method") {
  return {
    id,
    name: `Artefact ${id.slice(-1)}`,
    role,
    mode: "copy" as const,
    type: "image" as const,
    source: { root: "project", path: `out/${id}.png` },
    created: "2026-09-01T09:00:00Z",
    versions: [
      {
        v: 1,
        file: `evidence/${id}.png`,
        sha256: "a".repeat(64),
        size: 10,
        captured: "2026-09-01T09:00:00Z",
      },
    ],
  };
}

/** A with R1, R2 and nested C with R2; B with R3 and an unknown key; R1 also nowhere else. */
function sample(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      artefact(R1, "result"),
      artefact(R2, "result"),
      artefact(R3, "result"),
      artefact(M1, "method"),
    ],
    groups: [
      {
        id: GA,
        name: "Figures",
        items: [R1, R2],
        groups: [{ id: GC, name: "Supplementary", items: [R2], groups: [] }],
      },
      { id: GB, name: "Tables", items: [R3], groups: [], colour: "blue" },
    ],
  };
}

const ids = (file: ArtefactsFileModel) => file.groups.map((g) => g.id);

describe("createGroup", () => {
  it("adds an empty top-level group at the end with a new id and a trimmed name", () => {
    const env = testEnv();
    const { file, groupId } = must(
      createGroup(sample(), { name: "  Plots ", parent: null }, env),
    );
    expect(ids(file)).toEqual([GA, GB, groupId]);
    expect(file.groups[2]).toEqual({
      id: groupId,
      name: "Plots",
      items: [],
      groups: [],
    });
  });

  it("nests a new group under a parent", () => {
    const { file, groupId } = must(
      createGroup(sample(), { name: "Inner", parent: GC }, testEnv()),
    );
    expect(file.groups[0]?.groups[0]?.groups.map((g) => g.id)).toEqual([
      groupId,
    ]);
  });

  it("refuses an empty name and an unknown parent", () => {
    expect(
      createGroup(sample(), { name: "   ", parent: null }, testEnv()).ok,
    ).toBe(false);
    expect(createGroup(sample(), { name: "X", parent: M1 }, testEnv())).toEqual(
      {
        ok: false,
        error: { kind: "notFound", entity: "group", id: M1 },
      },
    );
  });
});

describe("renameGroup", () => {
  it("renames and keeps every other key, including unknown ones", () => {
    const file = must(renameGroup(sample(), GB, "Numbers"));
    expect(file.groups[1]).toEqual({
      id: GB,
      name: "Numbers",
      items: [R3],
      groups: [],
      colour: "blue",
    });
  });

  it("refuses a name with a line break", () => {
    expect(renameGroup(sample(), GB, "a\nb").ok).toBe(false);
  });
});

describe("moveGroup", () => {
  it("reorders siblings", () => {
    expect(ids(must(moveGroup(sample(), GB, null, 0)))).toEqual([GB, GA]);
  });

  it("nests a group under another, keeping its subtree", () => {
    const file = must(moveGroup(sample(), GA, GB, 0));
    expect(ids(file)).toEqual([GB]);
    expect(file.groups[0]?.groups[0]?.groups[0]?.id).toBe(GC);
  });

  it("appends when no position is given", () => {
    const file = must(moveGroup(sample(), GB, GA));
    expect(file.groups[0]?.groups.map((g) => g.id)).toEqual([GC, GB]);
  });

  it("moves a nested group to the top level", () => {
    const file = must(moveGroup(sample(), GC, null, 1));
    expect(ids(file)).toEqual([GA, GC, GB]);
  });

  it("refuses to move a group into itself or its own descendant", () => {
    expect(moveGroup(sample(), GA, GA, 0).ok).toBe(false);
    expect(moveGroup(sample(), GA, GC, 0).ok).toBe(false);
  });
});

describe("deleteGroup", () => {
  it("removes the group and its subgroups, but never an artefact", () => {
    const before = sample();
    const file = must(deleteGroup(before, GA));
    expect(ids(file)).toEqual([GB]);
    expect(file.artefacts).toEqual(before.artefacts);
    expect(ungroupedArtefacts(file).map((a) => a.id)).toEqual([R1, R2]);
  });

  it("refuses an unknown group", () => {
    expect(deleteGroup(sample(), R1).ok).toBe(false);
  });
});

describe("addToGroup", () => {
  it("adds a membership and keeps the others", () => {
    const file = must(addToGroup(sample(), R3, GA));
    expect(file.groups[0]?.items).toEqual([R1, R2, R3]);
    expect(file.groups[1]?.items).toEqual([R3]);
  });

  it("inserts at a position", () => {
    const file = must(addToGroup(sample(), R3, GA, 1));
    expect(file.groups[0]?.items).toEqual([R1, R3, R2]);
  });

  it("refuses a second membership of the same group (FR-GRP-03)", () => {
    expect(addToGroup(sample(), R1, GA).ok).toBe(false);
  });

  it("refuses a method artefact and an unknown artefact", () => {
    expect(addToGroup(sample(), M1, GA).ok).toBe(false);
    expect(addToGroup(sample(), GB, GA)).toEqual({
      ok: false,
      error: { kind: "notFound", entity: "artefact", id: GB },
    });
  });
});

describe("moveToGroup", () => {
  it("takes the artefact out of the source group only", () => {
    const file = must(moveToGroup(sample(), R2, GA, GB));
    expect(file.groups[0]?.items).toEqual([R1]);
    expect(file.groups[0]?.groups[0]?.items).toEqual([R2]);
    expect(file.groups[1]?.items).toEqual([R3, R2]);
  });

  it("from Ungrouped is the same as adding", () => {
    const ungrouped = must(removeFromGroup(sample(), R3, GB));
    const file = must(moveToGroup(ungrouped, R3, null, GA, 0));
    expect(file.groups[0]?.items).toEqual([R3, R1, R2]);
  });

  it("refuses when the artefact is already in the target group", () => {
    expect(moveToGroup(sample(), R2, GA, GC).ok).toBe(false);
  });

  it("refuses when the artefact is not in the source group", () => {
    expect(moveToGroup(sample(), R3, GA, GC).ok).toBe(false);
  });

  it("within one group is a reorder", () => {
    const file = must(moveToGroup(sample(), R2, GA, GA, 0));
    expect(file.groups[0]?.items).toEqual([R2, R1]);
  });
});

describe("removeFromGroup and reorderItem", () => {
  it("removes one membership", () => {
    const file = must(removeFromGroup(sample(), R2, GC));
    expect(file.groups[0]?.groups[0]?.items).toEqual([]);
    expect(file.groups[0]?.items).toEqual([R1, R2]);
  });

  it("reorders an item within its group, clamping the position", () => {
    expect(must(reorderItem(sample(), GA, R1, 99)).groups[0]?.items).toEqual([
      R2,
      R1,
    ]);
    expect(must(reorderItem(sample(), GA, R2, -3)).groups[0]?.items).toEqual([
      R2,
      R1,
    ]);
  });

  it("refuses to remove or reorder an artefact the group does not hold", () => {
    expect(removeFromGroup(sample(), R3, GA).ok).toBe(false);
    expect(reorderItem(sample(), GA, R3, 0).ok).toBe(false);
  });
});

describe("ungroupedArtefacts", () => {
  it("lists result artefacts with no membership, in capture order, never methods", () => {
    const file = must(removeFromGroup(sample(), R3, GB));
    expect(ungroupedArtefacts(file).map((a) => a.id)).toEqual([R3]);
    expect(ungroupedArtefacts(sample())).toEqual([]);
  });
});
