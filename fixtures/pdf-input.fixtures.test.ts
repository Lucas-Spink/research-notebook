import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NotebookJson } from "../packages/format/src/index";

/**
 * S6-T06 (FR-ARC-06): the script the nightly PDF/A job runs turns the typical
 * fixture into the three files `export_fixture` compiles. The fixture is
 * copied first and the copy is checked to be unchanged afterwards.
 */

const FIXTURE = join(__dirname, "projects", "format-v1", "typical");
const SCRIPT = join(__dirname, "..", "scripts", "build-pdf-input.mjs");

function filesUnder(dir: string): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (at: string, prefix: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path, `${prefix}${entry.name}/`);
      else found[`${prefix}${entry.name}`] = readFileSync(path, "utf8");
    }
  };
  walk(dir, "");
  return found;
}

function run() {
  const work = mkdtempSync(join(tmpdir(), "pdf-input-"));
  const project = join(work, "project");
  const out = join(work, "out");
  cpSync(FIXTURE, project, { recursive: true });
  const before = filesUnder(project);
  execFileSync(
    process.execPath,
    [SCRIPT, project, out, "2026-10-09T12:00:00Z"],
    { stdio: "pipe" },
  );
  return { project, out, before };
}

describe("build-pdf-input (FR-ARC-06)", () => {
  const { project, out, before } = run();

  it("writes the three files the exporter reads", () => {
    expect(readdirSync(out).sort()).toEqual([
      "bibliography.json",
      "notebook.json",
      "pdf-input.json",
    ]);
  });

  it("describes the whole typical project", () => {
    const input = JSON.parse(
      readFileSync(join(out, "pdf-input.json"), "utf8"),
    ) as {
      schemaVersion: number;
      generated: string;
      questions: unknown[];
      experiments: unknown[];
    };
    expect(input.schemaVersion).toBe(1);
    expect(input.generated).toBe("2026-10-09T12:00:00Z");
    expect(input.questions).toHaveLength(3);
    expect(input.experiments).toHaveLength(12);
  });

  it("embeds a notebook.json that follows its schema and the project's own bibliography.json", () => {
    const notebook = NotebookJson.parse(
      JSON.parse(readFileSync(join(out, "notebook.json"), "utf8")),
    );
    expect(notebook.experiments).toHaveLength(12);
    expect(readFileSync(join(out, "bibliography.json"), "utf8")).toBe(
      before["_notebook/bibliography.json"],
    );
  });

  it("only reads the project", () => {
    expect(filesUnder(project)).toEqual(before);
  });
});
