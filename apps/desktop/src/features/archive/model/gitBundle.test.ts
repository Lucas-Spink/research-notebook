import { describe, expect, it } from "vitest";
import { arranged, arrangedWithRepositories } from "./fixtures";
import { writeGitBundles, type GitBundleApi } from "./gitBundle";

type Answer = Awaited<ReturnType<GitBundleApi["writeGitBundles"]>>;

function fakeApi(answer: Answer | "reject") {
  const calls: unknown[][] = [];
  const api: GitBundleApi = {
    writeGitBundles: (...args) => {
      calls.push(args);
      return answer === "reject"
        ? Promise.reject(new Error("gone"))
        : Promise.resolve(answer);
    },
  };
  return { api, calls };
}

describe("writeGitBundles (FR-ARC-04)", () => {
  it("asks for each referenced repository once, in sorted order", async () => {
    const { api, calls } = fakeApi({
      status: "ok",
      data: [{ kind: "failed" }, { kind: "failed" }],
    });

    await writeGitBundles({
      api,
      folder: 4,
      arranged: arrangedWithRepositories(["vendor/stats", ".", "vendor/stats"]),
    });

    expect(calls).toEqual([[4, [".", "vendor/stats"]]]);
  });

  it("pairs each answer with its repository by position", async () => {
    const { api } = fakeApi({
      status: "ok",
      data: [
        {
          kind: "written",
          file: "_notebook/exports/git/root.bundle",
          bytes: 9,
        },
        { kind: "noCommits" },
      ],
    });

    const result = await writeGitBundles({
      api,
      folder: 1,
      arranged: arrangedWithRepositories(["vendor/stats", "."]),
    });

    expect(result).toEqual({
      ok: true,
      value: [
        {
          repo: ".",
          outcome: {
            kind: "written",
            file: "_notebook/exports/git/root.bundle",
            bytes: 9,
          },
        },
        { repo: "vendor/stats", outcome: { kind: "noCommits" } },
      ],
    });
  });

  it("does not call the application when no repository is referenced", async () => {
    const { api, calls } = fakeApi({ status: "ok", data: [] });

    const result = await writeGitBundles({
      api,
      folder: 1,
      arranged: arranged(),
    });

    expect(result).toEqual({ ok: true, value: [] });
    expect(calls).toEqual([]);
  });

  it("says the project is not writable rather than failing vaguely", async () => {
    const { api } = fakeApi({
      status: "error",
      error: { kind: "notWritable" },
    });

    const result = await writeGitBundles({
      api,
      folder: 1,
      arranged: arrangedWithRepositories(["."]),
    });

    expect(result).toEqual({ ok: false, error: "notWritable" });
  });

  it("never reports a shorter answer as if every repository had been handled", async () => {
    const { api } = fakeApi({ status: "ok", data: [{ kind: "noCommits" }] });

    const result = await writeGitBundles({
      api,
      folder: 1,
      arranged: arrangedWithRepositories([".", "code"]),
    });

    expect(result).toEqual({ ok: false, error: "writeFailed" });
  });

  it("treats a rejected call as a failure", async () => {
    const { api } = fakeApi("reject");

    const result = await writeGitBundles({
      api,
      folder: 1,
      arranged: arrangedWithRepositories(["."]),
    });

    expect(result).toEqual({ ok: false, error: "writeFailed" });
  });
});
