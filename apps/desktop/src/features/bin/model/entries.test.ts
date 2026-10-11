import { describe, expect, it } from "vitest";
import type { BinItem } from "../../../ipc/bindings";
import { binnedWhen, describeEntry, newestFirst } from "./entries";

const item = (over: Partial<BinItem>): BinItem => ({
  stamp: "2026-09-21T10-15-00Z",
  kind: "question",
  name: "Q-001.md",
  original: "_notebook/questions/Q-001.md",
  ...over,
});

describe("the bin's entries", () => {
  it("reads when something was binned from its folder name", () => {
    expect(binnedWhen("2026-09-21T10-15-00Z")).toBe("21 Sep 2026, 10:15 UTC");
    expect(binnedWhen("2026-01-05T00-05-09Z-2")).toBe("5 Jan 2026, 00:05 UTC");
  });

  it("shows a stamp it cannot read as it is, rather than guessing", () => {
    expect(binnedWhen("not-a-stamp")).toBe("not-a-stamp");
  });

  it("names a question by its file without the extension", () => {
    expect(describeEntry(item({}))).toMatchObject({
      kind: "Question",
      title: "Q-001",
    });
  });

  it("names an experiment by its folder", () => {
    expect(
      describeEntry(item({ kind: "experiment", name: "EXP-004" })),
    ).toMatchObject({ kind: "Experiment", title: "EXP-004" });
  });

  it("says that removed files belong to an experiment", () => {
    expect(
      describeEntry(item({ kind: "files", name: "EXP-004" })),
    ).toMatchObject({ kind: "Removed files", title: "from EXP-004" });
  });

  it("lists the newest first, and keeps the order of those binned together", () => {
    const a = item({ stamp: "2026-09-21T10-15-00Z", name: "A.md" });
    const b = item({ stamp: "2026-09-22T09-00-00Z", name: "B.md" });
    const c = item({ stamp: "2026-09-22T09-00-00Z", name: "C.md" });
    expect(newestFirst([a, b, c]).map((i) => i.name)).toEqual([
      "B.md",
      "C.md",
      "A.md",
    ]);
  });
});
