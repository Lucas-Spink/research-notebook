import { newProject } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import {
  locateOutcome,
  summariseProject,
  type ProjectSummary,
} from "./summary";

const ID = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";
const OTHER_ID = "01JAXA1C5D8E2F4G6H7J9K0M1N";
const ROOT_ID = "01JAXQ8M3K7T2V9R4W6Y5Z0B1C";

function projectYaml(name = "Batch effects"): string {
  const created = newProject(
    { name, appVersion: "0.1.0" },
    { now: () => new Date("2026-09-19T08:30:15Z"), newId: () => ID },
  );
  if (!created.ok) throw new Error(created.error.message);
  return created.value.projectYaml;
}

function summary(text: string): ProjectSummary {
  const result = summariseProject(text);
  if (!result.ok) throw new Error(`expected a summary, got ${result.error}`);
  return result.value;
}

describe("summariseProject", () => {
  it("reads the identifier and name of a project", () => {
    expect(summary(projectYaml())).toEqual({
      id: ID,
      name: "Batch effects",
      evidenceInGit: false,
      externalRoots: [],
      archived: null,
    });
  });

  it("reports when and that a project was archived", () => {
    const text = projectYaml().replace(
      "archived: null",
      'archived: "2026-09-01T09:00:00Z"',
    );
    expect(summary(text).archived).toBe("2026-09-01T09:00:00Z");
  });

  it("lists the external roots with their labels", () => {
    const text = projectYaml().replace(
      "external_roots: []",
      `external_roots:\n  - id: "${ROOT_ID}"\n    label: "Raw sequencing"`,
    );
    expect(summary(text).externalRoots).toEqual([
      { id: ROOT_ID, label: "Raw sequencing" },
    ]);
  });

  it("reads a file with CRLF line endings and a byte-order mark", () => {
    const text = `${String.fromCharCode(0xfeff)}${projectYaml().replace(/\n/g, "\r\n")}`;
    expect(summary(text).id).toBe(ID);
  });

  it("reports a newer format version without reading anything else", () => {
    const text = projectYaml().replace(
      "format_version: 1",
      "format_version: 2",
    );
    expect(summariseProject(text)).toEqual({ ok: false, error: "newerFormat" });
  });

  it.each([
    ["text that is not YAML", "{ this: is: not yaml"],
    ["an empty file", ""],
    ["a file missing required keys", 'format_version: 1\nname: "x"\n'],
    [
      "a name that is empty",
      projectYaml().replace('name: "Batch effects"', 'name: ""'),
    ],
  ])("reports %s as an invalid project", (_label, text) => {
    expect(summariseProject(text)).toEqual({
      ok: false,
      error: "invalidProject",
    });
  });
});

describe("locateOutcome", () => {
  it("accepts the folder when it holds the project being located", () => {
    const outcome = locateOutcome(ID, projectYaml());
    expect(outcome.kind).toBe("match");
  });

  it("rejects a folder that holds a different project", () => {
    const outcome = locateOutcome(OTHER_ID, projectYaml());
    expect(outcome.kind).toBe("differentProject");
    if (outcome.kind === "differentProject")
      expect(outcome.summary.id).toBe(ID);
  });

  it("passes on why the folder could not be read", () => {
    expect(locateOutcome(ID, "nonsense: [")).toEqual({
      kind: "failed",
      error: "invalidProject",
    });
    expect(
      locateOutcome(
        ID,
        projectYaml().replace("format_version: 1", "format_version: 9"),
      ),
    ).toEqual({ kind: "failed", error: "newerFormat" });
  });
});
