import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ArtefactsFileModel } from "../schema";
import { checkSourceForUpdate } from "../index";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

const sha256Arb = fc.stringMatching(/^[0-9a-f]{64}$/);

function fileWithVersions(hashes: readonly string[]): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
        name: "artefact",
        role: "result",
        mode: "copy",
        type: "other",
        source: { root: "project", path: "data/a.bin" },
        created: "2026-09-01T09:00:00Z",
        versions: hashes.map((sha256, i) => ({
          v: i + 1,
          file: `evidence/a${i === 0 ? "" : `.v${i + 1}`}.bin`,
          sha256,
          size: i + 1,
          captured: "2026-09-01T09:00:00Z",
        })),
      },
    ],
    groups: [],
  };
}

describe("checkSourceForUpdate sequences (FR-EVD-06)", () => {
  it("is upToDate exactly when the observed hash equals the latest version's hash", () => {
    fc.assert(
      fc.property(
        fc.array(sha256Arb, { minLength: 1, maxLength: 10 }),
        sha256Arb,
        (versionHashes, observed) => {
          const file = fileWithVersions(versionHashes);
          const result = checkSourceForUpdate(
            file,
            "01JAXR5D8K2M4N6P8Q0R2S4T6V",
            observed,
          );
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const last = versionHashes[versionHashes.length - 1];
          expect(result.value.status).toBe(
            last === observed ? "upToDate" : "changed",
          );
        },
      ),
      { numRuns },
    );
  });
});
