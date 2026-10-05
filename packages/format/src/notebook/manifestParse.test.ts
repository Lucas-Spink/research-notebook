import { describe, expect, it } from "vitest";
import { arrangedFrom, loadedExperiment } from "../../test/notebook-support";
import { artefactsSample } from "../../test/samples";
import { ArtefactsFile } from "../schema";
import type { Arranged } from "./arrange";
import { buildManifest, manifestCell } from "./manifest";
import { parseManifest, unlistedFiles } from "./manifestParse";

const HEADER = "path,size,modified,sha256,experiments,groups\n";
const A = "_notebook/experiments/EXP-001/evidence/a.png";
const HASH = "a".repeat(64);
const row = (path: string, size = "3", sha = HASH) =>
  `${manifestCell(path)},${size},2026-09-05T09:40:52Z,${sha},EXP-001,Figures\n`;

describe("parseManifest (FR-ARC-03)", () => {
  it("reads path, size and hash from each line", () => {
    expect(parseManifest(HEADER + row(A))).toEqual({
      ok: true,
      value: [{ path: A, size: 3, sha256: HASH }],
    });
  });

  it("reads a header alone as an empty manifest", () => {
    expect(parseManifest(HEADER)).toEqual({ ok: true, value: [] });
  });

  it("reads quoted cells, doubled quotes and CRLF line endings", () => {
    const text = `${HEADER.replace("\n", "\r\n")}${A},3,2026-09-05T09:40:52Z,${HASH},EXP-001,"a,""b""\nc"\r\n`;
    expect(parseManifest(text)).toEqual({
      ok: true,
      value: [{ path: A, size: 3, sha256: HASH }],
    });
  });

  it.each([
    ["a different header", "path,size\n", 1, "header"],
    ["an empty file", "", 1, "header"],
    ["a short line", `${HEADER}${A},3\n`, 2, "cells"],
    [
      "a path outside captured files",
      HEADER + row("_notebook/project.yaml"),
      2,
      "path",
    ],
    ["a path that leaves the notebook", HEADER + row("../x"), 2, "path"],
    ["a size that is not a whole number", HEADER + row(A, "2.5"), 2, "size"],
    ["a negative size", HEADER + row(A, "-1"), 2, "size"],
    ["a hash in capitals", HEADER + row(A, "3", "A".repeat(64)), 2, "sha256"],
    ["a short hash", HEADER + row(A, "3", "ab"), 2, "sha256"],
    ["the same path twice", HEADER + row(A) + row(A), 3, "duplicate"],
    ["an unclosed quote", `${HEADER}"${A},3\n`, 1, "quote"],
    ["a stray quote", `${HEADER}a"b,3\n`, 1, "quote"],
  ])("refuses %s", (_name, text, line, reason) => {
    expect(parseManifest(text)).toEqual({ ok: false, error: { line, reason } });
  });
});

describe("unlistedFiles", () => {
  const artefacts = ArtefactsFile.parse(artefactsSample);
  const arranged: Arranged = (() => {
    const made = arrangedFrom([
      loadedExperiment("EXP-001", "EXP-001", "Q1", {}),
    ]);
    const [item] = made.unassigned;
    if (item === undefined) throw new Error("fixture");
    item.artefacts = { kind: "file", file: artefacts };
    return made;
  })();

  it("lists captured files the manifest does not, and none when it lists all", () => {
    const observed = new Map();
    for (const artefact of artefacts.artefacts) {
      if (artefact.mode !== "copy") continue;
      for (const v of artefact.versions) {
        observed.set(`_notebook/experiments/EXP-001/${v.file}`, {
          kind: "observed",
          size: v.size,
          modifiedMs: 0,
          sha256: v.sha256,
        });
      }
    }
    const parsed = parseManifest(buildManifest(arranged, observed).csv);
    if (!parsed.ok) throw new Error("manifest");
    expect(unlistedFiles(arranged, parsed.value)).toEqual([]);
    const dropped = parsed.value.slice(1);
    expect(unlistedFiles(arranged, dropped)).toEqual([parsed.value[0]?.path]);
  });
});
