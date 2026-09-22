import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { at, testEnv } from "../../test/notebook-support";
import type { ArtefactsFileModel } from "../schema";
import { applyLink, applyLinkChecked, applyRelink } from "../index";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

const commandArb = fc.record({
  kind: fc.constantFrom("new", "checked", "relink"),
  pick: fc.nat({ max: 50 }),
});

describe("link operation sequences (FR-EVD-07, FR-EVD-08)", () => {
  it("never touch an artefact other than the one targeted, and only `new` adds one", () => {
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
          let sequence = 0;

          for (const command of commands) {
            sequence += 1;
            const isNew = command.kind === "new" || file.artefacts.length === 0;
            const before = file.artefacts;

            if (isNew) {
              const result = applyLink(
                file,
                {
                  name: `artefact ${sequence}`,
                  role: "result",
                  type: "other",
                  source: { root: "project", path: `data/${sequence}.bin` },
                },
                {
                  sha256: sequence.toString(16).padStart(64, "0"),
                  size: sequence,
                  observedMtime: "2026-09-01T00:00:00Z",
                },
                env,
              );
              expect(result.ok).toBe(true);
              if (!result.ok) return;
              file = result.value.file;
            } else {
              const targetId = at(
                file.artefacts,
                command.pick % file.artefacts.length,
              ).id;
              const result =
                command.kind === "checked"
                  ? applyLinkChecked(file, targetId, env)
                  : applyRelink(
                      file,
                      targetId,
                      {
                        root: "project",
                        path: `data/relinked-${sequence}.bin`,
                      },
                      {
                        sha256: sequence.toString(16).padStart(64, "0"),
                        size: sequence,
                        observedMtime: "2026-09-01T00:00:00Z",
                      },
                      env,
                    );
              expect(result.ok).toBe(true);
              if (!result.ok) return;
              file = result.value.file;

              for (const earlier of before) {
                if (earlier.id === targetId) continue;
                const now = file.artefacts.find((a) => a.id === earlier.id);
                expect(now).toEqual(earlier);
              }
            }

            expect(new Set(file.artefacts.map((a) => a.id)).size).toBe(
              file.artefacts.length,
            );
          }
        },
      ),
      { numRuns },
    );
  });
});
