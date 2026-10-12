import { afterEach, describe, expect, it, vi } from "vitest";
import { events, type ChangeReport } from "../../../ipc/bindings";
import { relayChanges } from "./relay";

afterEach(() => vi.restoreAllMocks());

const report = (over: Partial<ChangeReport> = {}): ChangeReport => ({
  watching: true,
  changes: [],
  needsRescan: false,
  ...over,
});

describe("relayChanges", () => {
  it("sends the changed paths, and no file states", () => {
    const emit = vi
      .spyOn(events.projectFilesChanged, "emit")
      .mockResolvedValue();
    relayChanges(
      report({
        changes: [
          {
            path: "_notebook/questions/Q-001.md",
            state: { kind: "present", sha256: "a".repeat(64) },
          },
          {
            path: "_notebook/canvases/C.canvas.json",
            state: { kind: "missing" },
          },
        ],
      }),
    );
    expect(emit).toHaveBeenCalledWith({
      paths: [
        "_notebook/questions/Q-001.md",
        "_notebook/canvases/C.canvas.json",
      ],
      needsRescan: false,
    });
  });

  it("passes on that events may have been lost", () => {
    const emit = vi
      .spyOn(events.projectFilesChanged, "emit")
      .mockResolvedValue();
    relayChanges(report({ needsRescan: true }));
    expect(emit).toHaveBeenCalledWith({ paths: [], needsRescan: true });
  });

  it("does not fail where there is no window to tell", async () => {
    vi.spyOn(events.projectFilesChanged, "emit").mockRejectedValue(
      new Error("no window"),
    );
    expect(() => relayChanges(report({ needsRescan: true }))).not.toThrow();
    await Promise.resolve();
  });
});
