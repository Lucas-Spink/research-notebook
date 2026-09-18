import { describe, expect, it } from "vitest";
import { readGolden } from "../../test/golden";
import type { Result } from "../result";
import { parseArtefacts, serialiseArtefacts } from "./artefacts";
import { parseExperiment, serialiseExperiment } from "./experiment";
import { parseProject, serialiseProject } from "./project";
import { parseQuestion, serialiseQuestion } from "./question";
import { parseRequest, serialiseRequest } from "./request";

/**
 * Gate S2-G13 (spec 5.2, format-v1.md 3.1): files with CRLF and a BOM
 * parse; written files are LF without a BOM and end with exactly one LF.
 */

interface Case {
  name: string;
  golden: string;
  reserialise: (text: string) => string;
}

function through<T>(
  parse: (text: string) => Result<T>,
  serialise: (value: T) => string,
): (text: string) => string {
  return (text) => {
    const parsed = parse(text);
    if (!parsed.ok) throw new Error(parsed.error.message);
    return serialise(parsed.value);
  };
}

const cases: Case[] = [
  {
    name: "project.yaml",
    golden: "project.yaml",
    reserialise: through(parseProject, serialiseProject),
  },
  {
    name: "a question file",
    golden: "question.md",
    reserialise: through(parseQuestion, serialiseQuestion),
  },
  {
    name: "an experiment file",
    golden: "experiment.md",
    reserialise: through(parseExperiment, serialiseExperiment),
  },
  {
    name: "an experiment file with fences and unknown content",
    golden: "experiment-unknown-content.md",
    reserialise: through(parseExperiment, serialiseExperiment),
  },
  {
    name: "artefacts.yaml",
    golden: "artefacts.yaml",
    reserialise: through(parseArtefacts, serialiseArtefacts),
  },
  {
    name: "request.json",
    golden: "request-copy.json",
    reserialise: through(parseRequest, serialiseRequest),
  },
];

describe.each(cases)("$name", ({ golden, reserialise }) => {
  const canonical = readGolden(golden);

  it("reads CRLF line endings and writes LF", () => {
    const crlf = canonical.replace(/\n/g, "\r\n");
    expect(reserialise(crlf)).toBe(canonical);
  });

  it("reads a byte-order mark and writes none", () => {
    const written = reserialise(`\uFEFF${canonical}`);
    expect(written.startsWith("\uFEFF")).toBe(false);
    expect(written).toBe(canonical);
  });

  it("reads a BOM together with CRLF", () => {
    const text = `\uFEFF${canonical.replace(/\n/g, "\r\n")}`;
    expect(reserialise(text)).toBe(canonical);
  });

  it("reads a missing final newline and writes exactly one", () => {
    expect(reserialise(canonical.slice(0, -1))).toBe(canonical);
  });

  it("reads extra final blank lines and writes exactly one newline", () => {
    const written = reserialise(`${canonical}\n\n\n`);
    expect(written).toBe(canonical);
    expect(written.endsWith("\n\n")).toBe(false);
  });
});
