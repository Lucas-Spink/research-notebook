import { describe, expect, it } from "vitest";
import { readGolden } from "../test/golden";
import {
  parseExperiment,
  parseProject,
  parseQuestion,
  serialiseExperiment,
  serialiseProject,
} from "./files";

/**
 * Unknown YAML keys and values must come out of a save as they went in
 * (format-v1.md 3.3, S2-T03). Two JavaScript behaviours threaten that: plain
 * objects list integer-like keys first, and a double cannot hold every
 * integer. See ADR-0019.
 */

const EXPERIMENT_HEAD = `---
id: "01JAXQ9P2M6S1T8X3Z5A7C9E0G"
ref: "EXP-043"
question: "01JAXA1C5D8E2F4G6H7J9K0M1N"
title: "Unknown values"
status: "running"
created: "2026-09-06T08:00:00Z"
updated: "2026-09-06T08:30:00Z"
`;

const QUESTION_HEAD = `---
id: "01JAXA1C5D8E2F4G6H7J9K0M1N"
ref: "Q-001"
title: "Unknown values"
created: "2026-09-01T09:00:00Z"
`;

function experimentWith(extra: string): string {
  return `${EXPERIMENT_HEAD}${extra}---\n`;
}

function questionWith(extra: string): string {
  return `${QUESTION_HEAD}${extra}---\n`;
}

describe("unknown keys that look like integers", () => {
  it("are written after the known keys of an experiment, as they were read", () => {
    const text = experimentWith('"2": "two"\n"10": "ten"\n');
    const parsed = parseExperiment(text);
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(serialiseExperiment(parsed.value)).toBe(text);
  });

  it("are written after the known keys of project.yaml", () => {
    const text = `${readGolden("project.yaml")}"7": "seven"\n`;
    const parsed = parseProject(text);
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(serialiseProject(parsed.value)).toBe(text);
  });
});

describe("integers a double cannot represent exactly", () => {
  const safe = [
    "9007199254740991",
    "-9007199254740991",
    "0",
    "1e300",
    "1.0e20",
  ];
  const unsafe = [
    "9007199254740992",
    "-9007199254740992",
    "12345678901234567890",
    "-12345678901234567890",
    "0xFFFFFFFFFFFFFFFFFF",
    "0o7777777777777777777777",
  ];

  it.each(safe)("accepts %s in an unknown key", (value) => {
    expect(parseExperiment(experimentWith(`x_n: ${value}\n`)).ok).toBe(true);
  });

  it.each(unsafe)("rejects %s in an unknown experiment key", (value) => {
    const result = parseExperiment(experimentWith(`x_n: ${value}\n`));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("syntax");
      expect(result.error.message).toMatch(/integer/);
    }
  });

  it.each(unsafe)("rejects %s in an unknown question key", (value) => {
    expect(parseQuestion(questionWith(`x_n: ${value}\n`)).ok).toBe(false);
  });

  it.each(unsafe)("rejects %s in an unknown project.yaml key", (value) => {
    expect(
      parseProject(`${readGolden("project.yaml")}x_n: ${value}\n`).ok,
    ).toBe(false);
  });

  it("rejects an unsafe integer nested in a list and a map", () => {
    const text = experimentWith(
      "x_deep:\n  list:\n    - 1\n    - 12345678901234567890\n",
    );
    expect(parseExperiment(text).ok).toBe(false);
  });

  it("reports the line of the offending value", () => {
    const result = parseExperiment(
      experimentWith("x_a: 1\nx_n: 9007199254740992\n"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "syntax") {
      expect(result.error.line).toBeGreaterThan(0);
    }
  });

  it("does not reject the same digits inside a string", () => {
    expect(
      parseExperiment(experimentWith('x_n: "12345678901234567890"\n')).ok,
    ).toBe(true);
  });
});
