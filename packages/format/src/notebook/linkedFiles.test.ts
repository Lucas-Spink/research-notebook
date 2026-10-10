import { describe, expect, it } from "vitest";
import { arrangedFrom, loadedExperiment } from "../../test/notebook-support";
import { ArtefactsFile } from "../schema";
import { LINKED_FILES_ENTRY, linkedFilesList } from "./linkedFiles";

const HASH = "c".repeat(64);
const ROOT = "01JB0000000000000000000099";
const id = (n: number) =>
  `01JB00000000000000000000${String(n).padStart(2, "0")}`;

type Spec =
  | { mode: "link"; name: string; root: string; path: string }
  | { mode: "copy"; name: string };

function project(specs: readonly Spec[]) {
  const file = ArtefactsFile.parse({
    format_version: 1,
    artefacts: specs.map((spec, index) => ({
      id: id(index + 1),
      name: spec.name,
      role: "result",
      type: "other",
      created: "2026-09-03T14:02:11Z",
      ...(spec.mode === "link"
        ? {
            mode: "link",
            source: { root: spec.root, path: spec.path },
            link: {
              sha256: HASH,
              size: 1,
              observed_mtime: "2026-09-03T14:02:11Z",
              checked: "2026-09-03T14:02:11Z",
            },
          }
        : {
            mode: "copy",
            source: { root: "project", path: "a.txt" },
            versions: [
              {
                v: 1,
                file: "evidence/a.txt",
                sha256: HASH,
                size: 1,
                captured: "2026-09-03T14:02:11Z",
              },
            ],
          }),
    })),
    groups: [],
  });
  const arranged = arrangedFrom([
    loadedExperiment("EXP-001", "EXP-001", "Q1", {}),
  ]);
  const [item] = arranged.unassigned;
  if (item === undefined) throw new Error("fixture");
  item.artefacts = { kind: "file", file };
  return arranged;
}

describe("linkedFilesList (FR-ARC-08)", () => {
  it("names the entry the archive stores it under", () => {
    expect(LINKED_FILES_ENTRY).toBe("LINKED_FILES.txt");
  });

  it("is null when nothing is linked", () => {
    expect(
      linkedFilesList(project([{ mode: "copy", name: "Plot" }])),
    ).toBeNull();
    expect(linkedFilesList(project([]))).toBeNull();
  });

  it("lists each linked file with its experiment, root and path, and no copies", () => {
    const text = linkedFilesList(
      project([
        { mode: "link", name: "Reads", root: ROOT, path: "run1/reads.bam" },
        { mode: "copy", name: "Plot" },
        { mode: "link", name: "Counts", root: "project", path: "out/c.csv" },
      ]),
    );
    expect(text).toBe(
      [
        "Files recorded in place and not stored in this archive.",
        "Columns: experiment, name, root, path.",
        "",
        "EXP-001\tCounts\tproject\tout/c.csv",
        `EXP-001\tReads\t${ROOT}\trun1/reads.bam`,
        "",
      ].join("\n"),
    );
  });
});
