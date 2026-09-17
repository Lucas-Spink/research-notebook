import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectsRoot = join(__dirname, "projects");

function listDirs(path: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(path);
  } catch {
    return [];
  }
  return entries.filter((name) => statSync(join(path, name)).isDirectory());
}

describe("fixture harness", () => {
  it("finds at least one fixture project under fixtures/projects/<format-version>/", () => {
    const formatVersions = listDirs(projectsRoot);
    const fixtureProjects = formatVersions.flatMap((version) =>
      listDirs(join(projectsRoot, version)).map((name) => `${version}/${name}`),
    );

    expect(
      fixtureProjects.length,
      `No fixture projects found under fixtures/projects/. Real fixtures ` +
        `(minimal, typical, large, edge-cases, malformed) are added in ` +
        `S2-T13; this failure is expected until then.`,
    ).toBeGreaterThan(0);
  });
});
