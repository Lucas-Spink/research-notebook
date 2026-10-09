import { describe, expect, it } from "vitest";
import { arrangedWithFigures, projectYaml } from "./fixtures";
import { exportMachine, type MachineExportApi } from "./machineExport";

type Written = Awaited<ReturnType<MachineExportApi["writeMachineExport"]>>;

function fakeApi(reply: Written | ((count: number) => Written) | "reject") {
  const writes: unknown[][] = [];
  const api: MachineExportApi = {
    appVersion: () => Promise.resolve("0.2.0"),
    writeMachineExport: (...args) => {
      writes.push(args);
      if (reply === "reject") return Promise.reject(new Error("gone"));
      return Promise.resolve(
        typeof reply === "function" ? reply(args[1].length) : reply,
      );
    },
  };
  return { api, writes };
}

const allWritten = (count: number): Written => ({
  status: "ok",
  data: new Array<"written">(count).fill("written"),
});

const input = (api: MachineExportApi) => ({
  api,
  folder: 7,
  arranged: arrangedWithFigures(),
  project: projectYaml(),
  now: () => new Date("2026-10-09T12:00:00Z"),
});

type Sent = Array<{ name: string; text: string }>;
const sentOf = (call: unknown[] | undefined): Sent => (call?.[1] ?? []) as Sent;

describe("exportMachine (FR-ARC-07)", () => {
  it("sends the files with notebook.json last and counts what was written", async () => {
    const { api, writes } = fakeApi(allWritten);

    const result = await exportMachine(input(api));

    const sent = sentOf(writes[0]).map((f) => f.name);
    expect(writes[0]?.[0]).toBe(7);
    expect(sent[sent.length - 1]).toBe("notebook.json");
    expect(sent).toContain("markdown/EXP-001.md");
    expect(result).toEqual({
      ok: true,
      value: { files: sent.length, failedFiles: [] },
    });
  });

  it("uses the application's version and the given clock in notebook.json", async () => {
    const { api, writes } = fakeApi(allWritten);

    await exportMachine(input(api));

    const notebook = sentOf(writes[0]).find((f) => f.name === "notebook.json");
    expect(notebook?.text).toContain('"generatedBy": "0.2.0"');
    expect(notebook?.text).toContain('"generatedAt": "2026-10-09T12:00:00Z"');
  });

  it("names a file that could not be written", async () => {
    const { api, writes } = fakeApi((count) => ({
      status: "ok",
      data: Array.from({ length: count }, (_, i) =>
        i === 0 ? "writeFailed" : "written",
      ),
    }));

    const result = await exportMachine(input(api));

    const sent = sentOf(writes[0]).map((f) => f.name);
    expect(result).toEqual({
      ok: true,
      value: { files: sent.length - 1, failedFiles: [sent[0]] },
    });
  });

  it("reports a project that is not open for writing", async () => {
    const { api } = fakeApi({
      status: "error",
      error: { kind: "notWritable" },
    });
    expect(await exportMachine(input(api))).toEqual({
      ok: false,
      error: "notWritable",
    });
  });

  it("does not read a reply that misses files as a shorter list", async () => {
    const { api } = fakeApi({ status: "ok", data: ["written"] });
    expect(await exportMachine(input(api))).toEqual({
      ok: false,
      error: "writeFailed",
    });
  });

  it("reports a lost connection as a failure", async () => {
    const { api } = fakeApi("reject");
    expect(await exportMachine(input(api))).toEqual({
      ok: false,
      error: "writeFailed",
    });
  });
});
