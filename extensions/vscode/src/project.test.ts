import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findProjectRoot } from "./project";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rn-vscode-project-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const exists = existsSync;

describe("findProjectRoot", () => {
  it("finds the project one level up", () => {
    mkdirSync(join(dir, "_notebook"), { recursive: true });
    writeFileSync(
      join(dir, "_notebook", "project.yaml"),
      "format_version: 1\n",
    );
    mkdirSync(join(dir, "scripts"), { recursive: true });

    expect(findProjectRoot(join(dir, "scripts"), exists)).toBe(dir);
  });

  it("finds the project several levels up", () => {
    mkdirSync(join(dir, "_notebook"), { recursive: true });
    writeFileSync(
      join(dir, "_notebook", "project.yaml"),
      "format_version: 1\n",
    );
    const deep = join(dir, "results", "pca", "figures");
    mkdirSync(deep, { recursive: true });

    expect(findProjectRoot(deep, exists)).toBe(dir);
  });

  it("finds the project at the starting folder itself", () => {
    mkdirSync(join(dir, "_notebook"), { recursive: true });
    writeFileSync(
      join(dir, "_notebook", "project.yaml"),
      "format_version: 1\n",
    );

    expect(findProjectRoot(dir, exists)).toBe(dir);
  });

  it("returns undefined when there is no project", () => {
    const deep = join(dir, "a", "b", "c");
    mkdirSync(deep, { recursive: true });

    expect(findProjectRoot(deep, exists)).toBeUndefined();
  });
});
