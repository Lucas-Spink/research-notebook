import { describe, expect, it } from "vitest";
import { fakeApi, failure, ok } from "./fakeApi";
import { fetchZoteroStatus } from "./poll";

describe("fetchZoteroStatus", () => {
  it("reports connected, disabled and not-running from a successful check", async () => {
    expect(
      await fetchZoteroStatus(
        fakeApi(ok({ kind: "connected", serverId: "sPMHtLD6HHBd" })),
      ),
    ).toEqual({ kind: "connected" });
    expect(await fetchZoteroStatus(fakeApi(ok({ kind: "disabled" })))).toEqual({
      kind: "disabled",
    });
    expect(
      await fetchZoteroStatus(fakeApi(ok({ kind: "notRunning" }))),
    ).toEqual({ kind: "notRunning" });
  });

  it("reports unknown, and does not throw, when the check itself fails", async () => {
    await expect(
      fetchZoteroStatus(fakeApi(failure("requestFailed"))),
    ).resolves.toEqual({ kind: "unknown" });
  });
});
