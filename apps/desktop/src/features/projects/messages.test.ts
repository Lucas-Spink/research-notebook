import { describe, expect, it } from "vitest";
import type { ReadOnlyReason } from "./model/mode";
import {
  failureMessage,
  messages,
  readOnlyBanner,
  warningMessage,
} from "./messages";

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

describe("read-only banners", () => {
  const holder = {
    host: "lab-pc",
    pid: 4242,
    appVersion: "0.1.0",
    opened: "2026-09-19T10:00:00Z",
    heartbeat: "2026-09-19T10:04:00Z",
  };
  // One of every reason: a new reason without a banner fails to compile.
  const reasons: ReadOnlyReason[] = [
    { kind: "newerFormat" },
    { kind: "invalidProject" },
    { kind: "archived", archived: "2026-09-01T09:00:00Z" },
    { kind: "liveLock", holder },
    { kind: "staleLock", holder },
    { kind: "unreadableLock" },
    { kind: "blockedLock" },
    { kind: "readOnlyMedia" },
    { kind: "lockLost" },
    { kind: "lockUnavailable" },
  ];

  it("states a reason and an action for every reason", () => {
    for (const reason of reasons) {
      const banner = readOnlyBanner(reason);
      expect(banner.reason.length, reason.kind).toBeGreaterThan(20);
      expect(banner.action.length, reason.kind).toBeGreaterThan(20);
      expect(banner.reason, reason.kind).not.toBe(banner.action);
    }
  });

  it("says the project is read-only in every reason", () => {
    for (const reason of reasons) {
      expect(readOnlyBanner(reason).reason, reason.kind).toMatch(/read-only/);
    }
  });

  it("names the machine and the last time a lock was seen", () => {
    for (const kind of ["liveLock", "staleLock"] as const) {
      const banner = readOnlyBanner({ kind, holder });
      expect(banner.reason).toContain("lab-pc");
      expect(banner.reason).toContain("2026-09-19 10:04 UTC");
    }
  });

  it("never shows a process number, system path or error text", () => {
    for (const reason of reasons) {
      const text = Object.values(readOnlyBanner(reason)).join(" ");
      expect(text, reason.kind).not.toMatch(/4242|[A-Z]:\\|\/Users\/|Error:/);
    }
  });

  it("labels the two actions", () => {
    expect(messages.takeOver).toBe("Take over the lock");
    expect(messages.tryAgain).toBe("Try again");
  });
});
