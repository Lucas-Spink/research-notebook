import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReadOnlyReason } from "./model/mode";
import { ReadOnlyBanner } from "./ReadOnlyBanner";

const holder = {
  host: "lab-pc",
  pid: 4242,
  appVersion: "0.1.0",
  opened: "2026-09-19T10:00:00Z",
  heartbeat: "2026-09-19T10:04:00Z",
};

function render(reason: ReadOnlyReason, busy = false): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <ReadOnlyBanner
      reason={reason}
      busy={busy}
      onTakeOver={() => undefined}
      onRetry={() => undefined}
    />,
  );
  return container;
}

const labels = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].map((b) => b.textContent);

describe("ReadOnlyBanner", () => {
  it("is announced as a status and states the reason and the action", () => {
    const container = render({ kind: "newerFormat" });
    const banner = container.querySelector('[role="status"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toMatch(/newer version/);
    expect(banner?.textContent).toMatch(/Update the application/);
  });

  it("offers to take over a stale lock, and only that", () => {
    expect(labels(render({ kind: "staleLock", holder }))).toEqual([
      "Take over the lock",
    ]);
    expect(labels(render({ kind: "unreadableLock" }))).toEqual([
      "Take over the lock",
    ]);
  });

  it("offers to try again when a live lock, read-only media or a lost lock may clear", () => {
    for (const reason of [
      { kind: "liveLock", holder },
      { kind: "readOnlyMedia" },
      { kind: "lockLost" },
      { kind: "lockUnavailable" },
    ] satisfies ReadOnlyReason[]) {
      expect(labels(render(reason)), reason.kind).toEqual(["Try again"]);
    }
  });

  it("offers no button when nothing the person can click would help", () => {
    for (const reason of [
      { kind: "newerFormat" },
      { kind: "invalidProject" },
      { kind: "archived", archived: "2026-09-01T09:00:00Z" },
      { kind: "blockedLock" },
    ] satisfies ReadOnlyReason[]) {
      expect(labels(render(reason)), reason.kind).toEqual([]);
    }
  });

  it("disables the button while another action is running", () => {
    const container = render({ kind: "staleLock", holder }, true);
    expect(container.querySelector("button")?.disabled).toBe(true);
  });
});
