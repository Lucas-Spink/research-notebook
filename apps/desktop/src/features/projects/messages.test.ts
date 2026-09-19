import { describe, expect, it } from "vitest";
import { failureMessage, warningMessage } from "./messages";

describe("messages", () => {
  it("explains a repository file that could not be updated, naming it", () => {
    expect(
      warningMessage({ kind: "hygieneFailed", files: [".gitignore"] }),
    ).toContain(".gitignore");
    expect(
      warningMessage({
        kind: "hygieneFailed",
        files: [".gitignore", ".gitattributes"],
      }),
    ).toContain(".gitignore and .gitattributes");
  });

  it("explains why a project was not added to the recent list", () => {
    expect(
      warningMessage({ kind: "notRemembered", reason: "settingsDamaged" }),
    ).toContain(failureMessage("settingsDamaged"));
  });

  it("never shows a system path or code", () => {
    for (const reason of [
      "folderUnavailable",
      "notAProject",
      "alreadyInUse",
      "differentProject",
    ] as const) {
      expect(failureMessage(reason)).not.toMatch(/[A-Z]:\\|\/Users\/|Error:/);
    }
  });
});
