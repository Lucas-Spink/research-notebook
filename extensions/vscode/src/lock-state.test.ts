import { describe, expect, it } from "vitest";

import { lockState } from "./lock-state";

const NOW = new Date("2026-11-12T12:00:00Z");

const lock = (heartbeat: string) =>
  JSON.stringify({
    host: "pc",
    pid: 42,
    app_version: "0.1.3",
    opened: "2026-11-12T09:00:00Z",
    heartbeat,
  });

describe("lockState", () => {
  it("is open for a recent heartbeat", () => {
    expect(lockState(lock("2026-11-12T11:59:30Z"), NOW)).toBe("open");
  });

  it("is open just under five minutes", () => {
    expect(lockState(lock("2026-11-12T11:55:01Z"), NOW)).toBe("open");
  });

  it("is closed at five minutes or more: the lock is stale", () => {
    expect(lockState(lock("2026-11-12T11:55:00Z"), NOW)).toBe("closed");
    expect(lockState(lock("2026-11-12T08:00:00Z"), NOW)).toBe("closed");
  });

  it("is open for a heartbeat in the future, as the app counts it", () => {
    expect(lockState(lock("2026-11-12T12:30:00Z"), NOW)).toBe("open");
  });

  it("is closed when there is no lock file", () => {
    expect(lockState(undefined, NOW)).toBe("closed");
  });

  it("is unknown when the file is partly written or not a lock", () => {
    expect(lockState('{"host":"pc","pi', NOW)).toBe("unknown");
    expect(lockState("", NOW)).toBe("unknown");
    expect(lockState("[]", NOW)).toBe("unknown");
    expect(lockState(lock("yesterday"), NOW)).toBe("unknown");
  });
});
