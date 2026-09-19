import { describe, expect, it } from "vitest";
import { PROJECT_ID } from "../../test/samples";
import { parseProject, serialiseProject } from "./project";
import { newProject, type ProjectEnv } from "./new-project";

/** FR-PRJ-01: a new project starts from the spec 5.3 defaults. */

const env: ProjectEnv = {
  now: () => new Date("2026-09-19T08:30:15.789Z"),
  newId: () => PROJECT_ID,
};

const input = {
  name: "Batch effects in treated organoids",
  appVersion: "0.1.0",
};

function created(overrides: Partial<typeof input> = {}, using = env) {
  const result = newProject({ ...input, ...overrides }, using);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("newProject", () => {
  it("fills every key of project.yaml from the spec 5.3 defaults", () => {
    expect(created().project).toEqual({
      format_version: 1,
      id: PROJECT_ID,
      name: "Batch effects in treated organoids",
      created: "2026-09-19T08:30:15Z",
      last_written_by: "0.1.0",
      archived: null,
      locale: "en-GB",
      citation_style: "nature.csl",
      capture: { copy_threshold_mb: 100, evidence_in_git: false },
      numbering: { next_question: 1, next_experiment: 1 },
      order: [],
      table: {
        columns: [
          { key: "motivation", width: 220, hidden: false },
          { key: "methods", width: 260, hidden: false },
          { key: "results", width: 280, hidden: false },
          { key: "results_notes", width: 300, hidden: false },
          { key: "interpretation", width: 320, hidden: false },
          { key: "literature", width: 240, hidden: false },
        ],
        collapsed_questions: [],
      },
      external_roots: [],
    });
  });

  it("takes the time and the identifier from the injected environment", () => {
    const later = {
      now: () => new Date("2027-01-02T03:04:05Z"),
      newId: () => "01JAXA1C5D8E2F4G6H7J9K0M1N",
    };
    const { project } = created({}, later);
    expect(project.created).toBe("2027-01-02T03:04:05Z");
    expect(project.id).toBe("01JAXA1C5D8E2F4G6H7J9K0M1N");
  });

  it("gives text that parses back to the model and is already canonical", () => {
    const { project, projectYaml } = created();
    const parsed = parseProject(projectYaml);
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.value).toEqual(project);
    expect(serialiseProject(parsed.value)).toBe(projectYaml);
  });

  it("writes LF only, without a byte-order mark, ending in one newline", () => {
    const { projectYaml } = created();
    expect(projectYaml).not.toContain("\r");
    expect(projectYaml.startsWith("﻿")).toBe(false);
    expect(projectYaml.endsWith("\n")).toBe(true);
    expect(projectYaml.endsWith("\n\n")).toBe(false);
  });

  it("gives an empty bibliography in the JSON layout of format-v1.md 3.5", () => {
    expect(created().bibliographyJson).toBe("[]\n");
  });

  it("removes the space around a name", () => {
    expect(created({ name: "  Organoids \t" }).project.name).toBe("Organoids");
  });

  it.each([
    ["an empty name", ""],
    ["a name of spaces", "   "],
    ["a name with a line break", "Batch\neffects"],
    ["a name with a control character", "Batcheffects"],
  ])("refuses %s", (_label, name) => {
    const result = newProject({ ...input, name }, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("schema");
  });

  it("refuses an identifier that is not a ULID", () => {
    const result = newProject(input, { ...env, newId: () => "not-a-ulid" });
    expect(result.ok).toBe(false);
  });

  it("refuses an application version that is not semver", () => {
    expect(newProject({ ...input, appVersion: "latest" }, env).ok).toBe(false);
  });

  it("does not change the environment it is given", () => {
    const now = new Date("2026-09-19T08:30:15Z");
    created({}, { now: () => now, newId: () => PROJECT_ID });
    expect(now.toISOString()).toBe("2026-09-19T08:30:15.000Z");
  });
});
