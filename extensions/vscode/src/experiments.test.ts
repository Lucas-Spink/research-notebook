import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listExperiments } from "./experiments";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rn-vscode-experiments-"));
  mkdirSync(join(dir, "_notebook", "questions"), { recursive: true });
  mkdirSync(join(dir, "_notebook", "experiments"), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function question(ref: string, id: string, title: string): void {
  writeFileSync(
    join(dir, "_notebook", "questions", `${ref}.md`),
    `---\nid: "${id}"\nref: "${ref}"\ntitle: "${title}"\ncreated: "2026-01-06T09:00:00Z"\n---\n`,
  );
}

function experiment(
  ref: string,
  id: string,
  questionId: string,
  title: string,
): void {
  const folder = join(dir, "_notebook", "experiments", ref);
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, "experiment.md"),
    `---\nid: "${id}"\nref: "${ref}"\nquestion: "${questionId}"\ntitle: "${title}"\nstatus: "planned"\ncreated: "2026-01-06T09:00:00Z"\nupdated: "2026-01-06T09:00:00Z"\n---\n`,
  );
}

describe("listExperiments", () => {
  it("lists experiments with their question's ref and title, sorted by ref", async () => {
    question("Q-001", "01JAX000000000000000000001", "Does X explain Y?");
    experiment(
      "EXP-002",
      "01JAX000000000000000000003",
      "01JAX000000000000000000001",
      "Second run",
    );
    experiment(
      "EXP-001",
      "01JAX000000000000000000002",
      "01JAX000000000000000000001",
      "First run",
    );

    const choices = await listExperiments(dir);

    expect(choices).toEqual([
      {
        id: "01JAX000000000000000000002",
        ref: "EXP-001",
        title: "First run",
        questionRef: "Q-001",
        questionTitle: "Does X explain Y?",
      },
      {
        id: "01JAX000000000000000000003",
        ref: "EXP-002",
        title: "Second run",
        questionRef: "Q-001",
        questionTitle: "Does X explain Y?",
      },
    ]);
  });

  it("marks an experiment whose question cannot be found as unassigned", async () => {
    experiment(
      "EXP-001",
      "01JAX000000000000000000002",
      "01JAX999999999999999999999",
      "Orphan",
    );

    const choices = await listExperiments(dir);

    expect(choices).toEqual([
      {
        id: "01JAX000000000000000000002",
        ref: "EXP-001",
        title: "Orphan",
        questionRef: "?",
        questionTitle: "Unassigned",
      },
    ]);
  });

  it("skips an experiment file that fails to parse", async () => {
    question("Q-001", "01JAX000000000000000000001", "Does X explain Y?");
    experiment(
      "EXP-001",
      "01JAX000000000000000000002",
      "01JAX000000000000000000001",
      "Good one",
    );
    mkdirSync(join(dir, "_notebook", "experiments", "EXP-002"), {
      recursive: true,
    });
    writeFileSync(
      join(dir, "_notebook", "experiments", "EXP-002", "experiment.md"),
      "not frontmatter at all",
    );

    const choices = await listExperiments(dir);

    expect(choices.map((c) => c.ref)).toEqual(["EXP-001"]);
  });

  it("returns an empty list for a project with no experiments", async () => {
    expect(await listExperiments(dir)).toEqual([]);
  });
});
