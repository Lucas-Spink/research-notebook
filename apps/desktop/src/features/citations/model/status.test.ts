import { describe, expect, it } from "vitest";
import type { ZoteroConnection } from "../../../ipc/bindings";
import { stateForConnection } from "./status";

describe("stateForConnection", () => {
  it("maps a connected answer to connected, regardless of the server ID", () => {
    expect(
      stateForConnection({ kind: "connected", serverId: "sPMHtLD6HHBd" }),
    ).toEqual({ kind: "connected" });
    expect(stateForConnection({ kind: "connected", serverId: null })).toEqual({
      kind: "connected",
    });
  });

  it("maps disabled and not-running straight through", () => {
    expect(stateForConnection({ kind: "disabled" })).toEqual({
      kind: "disabled",
    });
    expect(stateForConnection({ kind: "notRunning" })).toEqual({
      kind: "notRunning",
    });
  });

  it("covers every connection kind: a new one fails to compile", () => {
    const kinds: ZoteroConnection[] = [
      { kind: "connected", serverId: null },
      { kind: "disabled" },
      { kind: "notRunning" },
    ];
    for (const connection of kinds) {
      expect(() => stateForConnection(connection)).not.toThrow();
    }
  });
});
