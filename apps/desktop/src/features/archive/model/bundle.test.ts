import { linkedFilesList } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { bundleStem, planBundle, writeBundle, type BundleApi } from "./bundle";
import { arranged } from "./fixtures";

const SUMMARY = {
  files: 4,
  bytes: 2048,
  skipped: 0,
  exceedsFat32Limit: false,
};

type Plan = Awaited<ReturnType<BundleApi["planBundle"]>>;
type Write = Awaited<ReturnType<BundleApi["writeBundle"]>>;

function fakeApi(plan: Plan | "reject", write: Write | "reject") {
  const writes: unknown[][] = [];
  const plans: unknown[][] = [];
  const api: BundleApi = {
    planBundle: (...args) => {
      plans.push(args);
      return plan === "reject"
        ? Promise.reject(new Error("gone"))
        : Promise.resolve(plan);
    },
    writeBundle: (...args) => {
      writes.push(args);
      return write === "reject"
        ? Promise.reject(new Error("gone"))
        : Promise.resolve(write);
    },
  };
  return { api, writes, plans };
}

describe("bundleStem (FR-ARC-08)", () => {
  it("names the file after the project and the kind of bundle", () => {
    expect(bundleStem("Organoid screen", "notebook")).toBe(
      "Organoid-screen-notebook",
    );
    expect(bundleStem("Organoid screen", "archive")).toBe(
      "Organoid-screen-archive",
    );
  });

  it("removes what a file name cannot hold on Windows or macOS", () => {
    expect(bundleStem(String.raw`a<b>c:d"e/f\g|h?i*j`, "archive")).toBe(
      "a-b-c-d-e-f-g-h-i-j-archive",
    );
  });

  it("trims dots and spaces from the ends and falls back when nothing is left", () => {
    expect(bundleStem(" ..x.. ", "notebook")).toBe("x-notebook");
    expect(bundleStem("???", "notebook")).toBe("project-notebook");
    expect(bundleStem("", "archive")).toBe("project-archive");
  });

  it("keeps the name short enough for any filesystem", () => {
    expect(bundleStem("x".repeat(500), "archive").length).toBeLessThanOrEqual(
      100,
    );
  });
});

describe("planBundle", () => {
  it("returns what the bundle would hold", async () => {
    const { api, plans } = fakeApi({ status: "ok", data: SUMMARY }, "reject");

    const result = await planBundle({ api, folder: 3, choice: "archive" });

    expect(result).toEqual({ ok: true, value: SUMMARY });
    expect(plans).toEqual([[3, "archive"]]);
  });

  it("is a failure, not a guess, when the project cannot be inspected", async () => {
    for (const plan of [
      { status: "error", error: { kind: "fileUnavailable" } } as const,
      "reject" as const,
    ]) {
      const { api } = fakeApi(plan, "reject");
      expect(await planBundle({ api, folder: 1, choice: "notebook" })).toEqual({
        ok: false,
        error: "planFailed",
      });
    }
  });
});

describe("writeBundle (FR-ARC-08)", () => {
  const written = {
    kind: "written",
    name: "p-archive.nbk",
    folder: "D:/out",
    bytes: 10,
    files: 3,
  } as const;

  it("adds the list of linked files to a full archive only", async () => {
    const full = fakeApi("reject", { status: "ok", data: written });
    await writeBundle({
      api: full.api,
      folder: 2,
      choice: "archive",
      stem: "p-archive",
      arranged: arranged(),
    });
    const [, , , archiveExtras] = full.writes[0] ?? [];
    expect(archiveExtras).toEqual([
      {
        path: "LINKED_FILES.txt",
        text: linkedFilesList(arranged()) ?? "",
      },
    ]);

    const notebook = fakeApi("reject", { status: "ok", data: written });
    await writeBundle({
      api: notebook.api,
      folder: 2,
      choice: "notebook",
      stem: "p-notebook",
      arranged: arranged(),
    });
    expect(notebook.writes).toEqual([[2, "notebook", "p-notebook", []]]);
  });

  it("returns what became of the bundle, and null when the person cancelled", async () => {
    const saved = fakeApi("reject", { status: "ok", data: written });
    expect(
      await writeBundle({
        api: saved.api,
        folder: 1,
        choice: "notebook",
        stem: "s",
        arranged: arranged(),
      }),
    ).toEqual({ ok: true, value: written });

    const cancelled = fakeApi("reject", { status: "ok", data: null });
    expect(
      await writeBundle({
        api: cancelled.api,
        folder: 1,
        choice: "notebook",
        stem: "s",
        arranged: arranged(),
      }),
    ).toEqual({ ok: true, value: null });
  });

  it("is a failure when the command fails or does not answer", async () => {
    for (const answer of [
      { status: "error", error: { kind: "internal" } } as const,
      "reject" as const,
    ]) {
      const { api } = fakeApi("reject", answer);
      expect(
        await writeBundle({
          api,
          folder: 1,
          choice: "archive",
          stem: "s",
          arranged: arranged(),
        }),
      ).toEqual({ ok: false, error: "writeFailed" });
    }
  });
});
