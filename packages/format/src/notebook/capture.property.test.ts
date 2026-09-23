import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { at, testEnv } from "../../test/notebook-support";
import type { ArtefactsFileModel } from "../schema";
import { applyCapture, type CaptureTarget } from "../index";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

const commandArb = fc.record({
  kind: fc.constantFrom("new", "existing"),
  pick: fc.nat({ max: 50 }),
  withProvenance: fc.boolean(),
});

/** The last version number of a copy-mode artefact, or 0 for a link-mode one. */
function lastVersion(
  artefact: ArtefactsFileModel["artefacts"][number],
): number {
  if (artefact.mode !== "copy") return 0;
  const versions = artefact.versions;
  const last = versions[versions.length - 1];
  return last === undefined ? 0 : last.v;
}

describe("applyCapture sequences (S3-G01)", () => {
  it("keep versions strictly ascending, never rewrite an earlier one, and add exactly one artefact per new target", () => {
    fc.assert(
      fc.property(
        fc.array(commandArb, { minLength: 1, maxLength: 30 }),
        (commands) => {
          const env = testEnv();
          let file: ArtefactsFileModel = {
            format_version: 1,
            artefacts: [],
            groups: [],
          };
          let created = 0;
          let sequence = 0;

          for (const command of commands) {
            sequence += 1;
            const isNew = command.kind === "new" || file.artefacts.length === 0;
            const target: CaptureTarget = isNew
              ? {
                  kind: "new",
                  name: `artefact ${sequence}`,
                  role: "result",
                  type: "other",
                  source: { root: "project", path: `data/${sequence}.bin` },
                }
              : {
                  kind: "existing",
                  artefactId: at(
                    file.artefacts,
                    command.pick % file.artefacts.length,
                  ).id,
                };
            const number = isNew
              ? 1
              : lastVersion(
                  at(file.artefacts, command.pick % file.artefacts.length),
                ) + 1;

            const before = file.artefacts;
            const provenance = command.withProvenance
              ? {
                  repo: ".",
                  commit: sequence.toString(16).padStart(40, "0"),
                  pathInRepo: `data/${sequence}.bin`,
                  fileDirty: sequence % 2 === 0,
                  treeDirty: sequence % 3 === 0,
                }
              : undefined;
            const result = applyCapture(
              file,
              target,
              {
                file: `evidence/${sequence}.bin`,
                sha256: sequence.toString(16).padStart(64, "0"),
                size: sequence,
                number,
                ...(provenance !== undefined && { provenance }),
              },
              env,
            );
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            file = result.value.file;
            if (isNew) created += 1;

            for (const artefact of file.artefacts) {
              if (artefact.mode !== "copy") continue;
              for (let i = 1; i < artefact.versions.length; i += 1) {
                expect(at(artefact.versions, i).v).toBeGreaterThan(
                  at(artefact.versions, i - 1).v,
                );
              }
            }

            const targetId = isNew
              ? at(file.artefacts, file.artefacts.length - 1).id
              : target.kind === "existing"
                ? target.artefactId
                : undefined;
            const targetArtefact = file.artefacts.find(
              (a) => a.id === targetId,
            );
            const targetVersion =
              targetArtefact?.mode === "copy"
                ? targetArtefact.versions[targetArtefact.versions.length - 1]
                : undefined;
            if (provenance === undefined) {
              expect(targetVersion?.provenance).toBeUndefined();
            } else {
              expect(targetVersion?.provenance).toEqual({
                repo: provenance.repo,
                commit: provenance.commit,
                path_in_repo: provenance.pathInRepo,
                file_dirty: provenance.fileDirty,
                tree_dirty: provenance.treeDirty,
              });
            }
            for (const earlier of before) {
              const now = file.artefacts.find((a) => a.id === earlier.id);
              expect(now).toBeDefined();
              if (
                now !== undefined &&
                earlier.mode === "copy" &&
                now.mode === "copy"
              ) {
                expect(now.versions.slice(0, earlier.versions.length)).toEqual(
                  earlier.versions,
                );
              }
            }
          }

          expect(file.artefacts).toHaveLength(created);
        },
      ),
      { numRuns },
    );
  });
});
