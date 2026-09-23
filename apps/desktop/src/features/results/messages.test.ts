import { describe, expect, it } from "vitest";
import { refusalMessage, resultsMessages } from "./messages";

describe("resultsMessages", () => {
  it("counts artefacts and groups in words", () => {
    expect(resultsMessages.counts(1, 0)).toBe("1 artefact");
    expect(resultsMessages.counts(0, 0)).toBe("0 artefacts");
    expect(resultsMessages.counts(3, 2)).toBe("3 artefacts, 2 groups");
  });

  it("says what deleting a group removes, and that artefacts and files stay", () => {
    expect(
      resultsMessages.confirmDelete("Figures", { groups: 1, memberships: 3 }),
    ).toBe(
      "Delete the group “Figures” and the 1 group inside it? 3 memberships are removed. No artefact or file is deleted.",
    );
    expect(
      resultsMessages.confirmDelete("Tables", { groups: 0, memberships: 1 }),
    ).toBe(
      "Delete the group “Tables”? 1 membership is removed. No artefact or file is deleted.",
    );
  });
});

describe("refusalMessage", () => {
  it("explains every refusal and says nothing changed", () => {
    const messages = [
      refusalMessage({ kind: "notFound", entity: "group", id: "x" }),
      refusalMessage({ kind: "invalid", message: "m", field: "items" }),
      refusalMessage({ kind: "invalid", message: "m", field: "role" }),
      refusalMessage({ kind: "invalid", message: "m", field: "groups" }),
      refusalMessage({ kind: "invalid", message: "m" }),
    ];
    expect(messages[0]).toBe(
      "That group no longer exists. Nothing was changed.",
    );
    for (const text of messages) expect(text).toMatch(/Nothing was changed\.$/);
    expect(new Set(messages).size).toBe(messages.length);
  });
});
