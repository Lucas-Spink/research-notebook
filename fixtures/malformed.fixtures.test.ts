import {
  parseExperiment,
  parseProject,
  parseQuestion,
} from "../packages/format/src/index";
import { describe, expect, it } from "vitest";
import { openFixture } from "./support";

/**
 * Gate S2-G04: malformed files open read-only. Each file here demonstrates
 * one documented failure mode of format-v1.md 4.3, and one question is left
 * valid to show that a malformed file makes only itself read-only, not the
 * whole project (format-v1.md section 6, spec P6).
 *
 * "Editing attempts" and "closing" (the rest of S2-G04's pass criterion) are
 * app-level behaviour already covered elsewhere: a file that fails to parse
 * is never loaded into a `NotebookState`, so no `Plan` can ever name it
 * (packages/format/src/notebook), and `write_notebook_file` never runs
 * without one. This suite proves what `packages/format` alone can prove:
 * each file fails to parse, with the error kind format-v1.md predicts, and
 * its bytes are unchanged by the attempt.
 */

describe("malformed fixture: each file fails to parse as format-v1.md predicts", () => {
  const fixture = openFixture("malformed");

  it("a well-formed question still parses, so read-only is per file", () => {
    const before = fixture.hash("_notebook/questions/Q-001.md");
    const result = parseQuestion(fixture.read("_notebook/questions/Q-001.md"));
    expect(result.ok).toBe(true);
    expect(fixture.hash("_notebook/questions/Q-001.md")).toBe(before);
  });

  it("a question with no closing frontmatter fence fails as kind 'frontmatter'", () => {
    const path = "_notebook/questions/Q-002.md";
    const before = fixture.hash(path);
    const result = parseQuestion(fixture.read(path));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("frontmatter");
    expect(fixture.hash(path)).toBe(before);
  });

  it("a status the schema does not allow fails as kind 'schema'", () => {
    const path = "_notebook/experiments/EXP-001/experiment.md";
    const before = fixture.hash(path);
    const result = parseExperiment(fixture.read(path));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("schema");
    expect(fixture.hash(path)).toBe(before);
  });

  it("a duplicated frontmatter key fails as kind 'syntax'", () => {
    const path = "_notebook/experiments/EXP-002/experiment.md";
    const before = fixture.hash(path);
    const result = parseExperiment(fixture.read(path));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("syntax");
    expect(fixture.hash(path)).toBe(before);
  });

  it("a recognised heading that appears twice fails as kind 'body'", () => {
    const path = "_notebook/experiments/EXP-003/experiment.md";
    const before = fixture.hash(path);
    const result = parseExperiment(fixture.read(path));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("body");
    expect(fixture.hash(path)).toBe(before);
  });
});

describe("future-format fixture: a newer format opens the whole project read-only (S2-G10)", () => {
  const fixture = openFixture("future-format");

  it("is reported as unsupported-version, naming the version found, before anything else is checked", () => {
    const path = "_notebook/project.yaml";
    const before = fixture.hash(path);
    const result = parseProject(fixture.read(path));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        kind: "unsupported-version",
        found: 2,
      });
    }
    expect(fixture.hash(path)).toBe(before);
  });
});
