import { describe, expect, it } from "vitest";
import { applyGroupAction } from "./actions";
import { ids, sampleArtefacts } from "./sample";

const env = {
  now: () => new Date("2026-09-23T10:00:00Z"),
  newId: () => ids.g(9),
  appVersion: "0.0.0",
};

describe("applyGroupAction", () => {
  it("carries out each action with packages/format", () => {
    const file = sampleArtefacts();
    const created = applyGroupAction(
      file,
      { kind: "createGroup", name: "Plots", parent: null },
      env,
    );
    expect(created.ok && created.value.groups.map((g) => g.name)).toEqual([
      "Figures",
      "Tables",
      "Plots",
    ]);

    const moved = applyGroupAction(
      file,
      {
        kind: "moveToGroup",
        artefactId: ids.r(1),
        from: ids.g(1),
        to: ids.g(2),
      },
      env,
    );
    expect(moved.ok && moved.value.groups[1]?.items).toEqual([
      ids.r(3),
      ids.r(1),
    ]);

    const deleted = applyGroupAction(
      file,
      { kind: "deleteGroup", groupId: ids.g(2) },
      env,
    );
    expect(deleted.ok && deleted.value.artefacts).toEqual(file.artefacts);
  });

  it("returns the refusal for a second membership", () => {
    expect(
      applyGroupAction(
        sampleArtefacts(),
        { kind: "addToGroup", artefactId: ids.r(1), groupId: ids.g(1) },
        env,
      ).ok,
    ).toBe(false);
  });
});
