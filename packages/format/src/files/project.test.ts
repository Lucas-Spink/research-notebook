import { describe, expect, it } from "vitest";
import { PROJECT_ID } from "../../test/samples";
import { newProject, type ProjectEnv } from "./new-project";
import { addExternalRoot, parseProject, serialiseProject } from "./project";

/** FR-PRJ-07: external roots have a label in the project and a path per machine. */

const newProjectEnv: ProjectEnv = {
  now: () => new Date("2026-09-19T08:30:15.789Z"),
  newId: () => PROJECT_ID,
};

const ROOT_ID = "01JAXW0A2B4C6D8E0F2G4H6J8K";

function baseProject() {
  const result = newProject(
    { name: "Batch effects in treated organoids", appVersion: "0.1.0" },
    newProjectEnv,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value.project;
}

function must<T, E>(result: { ok: boolean; value?: T; error?: E }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value as T;
}

describe("addExternalRoot", () => {
  const env = { newId: () => ROOT_ID, appVersion: "0.2.0" };

  it("appends a root with a generated ID and the trimmed label", () => {
    const added = must(addExternalRoot(baseProject(), "  Lab share  ", env));
    expect(added.root).toEqual({ id: ROOT_ID, label: "Lab share" });
    expect(added.project.external_roots).toEqual([
      { id: ROOT_ID, label: "Lab share" },
    ]);
  });

  it("stamps the running version as the last writer", () => {
    const added = must(addExternalRoot(baseProject(), "Lab share", env));
    expect(added.project.last_written_by).toBe("0.2.0");
  });

  it("leaves everything else in project.yaml unchanged", () => {
    const before = baseProject();
    const added = must(addExternalRoot(before, "Lab share", env));
    expect({
      ...added.project,
      external_roots: [],
      last_written_by: "",
    }).toEqual({ ...before, external_roots: [], last_written_by: "" });
  });

  it("round-trips through serialiseProject and parseProject", () => {
    const added = must(addExternalRoot(baseProject(), "Lab share", env));
    const parsed = must(parseProject(serialiseProject(added.project)));
    expect(parsed).toEqual(added.project);
  });

  it("refuses an empty label, even if it is only whitespace", () => {
    const result = addExternalRoot(baseProject(), "   ", env);
    expect(result).toEqual({ ok: false, error: { kind: "emptyLabel" } });
  });

  it("refuses a label already used by another of the project's roots", () => {
    const first = must(addExternalRoot(baseProject(), "Lab share", env));
    const result = addExternalRoot(first.project, "Lab share", {
      ...env,
      newId: () => "01JAXW1B3C5D7E9F1G3H5J7K9M",
    });
    expect(result).toEqual({ ok: false, error: { kind: "duplicateLabel" } });
  });

  it("refuses a label with a line break", () => {
    const result = addExternalRoot(baseProject(), "Lab\nshare", env);
    expect(result).toEqual({ ok: false, error: { kind: "invalidLabel" } });
  });
});
