import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arrangedFrom, loadedExperiment } from "../../test/notebook-support";
import {
  ARTEFACT_RAW,
  ARTEFACT_TREATMENT,
  artefactsSample,
  bibliographySample,
} from "../../test/samples";
import { ArtefactsFile, BibliographyFile } from "../schema";
import { buildIntegrityReport, type IntegrityObservations } from "./integrity";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

const artefacts = ArtefactsFile.parse(artefactsSample);
const bibliography = BibliographyFile.parse(bibliographySample);
const GONE = "01JB0000000000000000000009";
const OK_KEY = "z:u:7XK2PQ9M";
const TRASHED_KEY = "z:g4521:ABCD2345";
const ABSENT_KEY = "z:u:NOSUCH99";

/** A piece of section text with the problems it contains, known by construction so the oracle needs no parser. */
type Piece = { text: string; unresolved: string[]; badCites: string[] };

const link = (ulid: string, version: string) =>
  `[F](evidence/f.pdf "art:${ulid}${version}")`;
const piece: fc.Arbitrary<Piece> = fc.oneof(
  fc
    .constantFrom(" ", "words ", "\n\n")
    .map((text): Piece => ({ text, unresolved: [], badCites: [] })),
  fc.constantFrom(ARTEFACT_TREATMENT, ARTEFACT_RAW).map((ulid): Piece => ({
    text: link(ulid, ""),
    unresolved: [],
    badCites: [],
  })),
  fc.constantFrom(1, 2).map((v): Piece => ({
    text: link(ARTEFACT_TREATMENT, ` v${v}`),
    unresolved: [],
    badCites: [],
  })),
  fc.constantFrom(3, 7).map((v): Piece => ({
    text: link(ARTEFACT_TREATMENT, ` v${v}`),
    unresolved: [`${ARTEFACT_TREATMENT}:${v}`],
    badCites: [],
  })),
  fc.constant<Piece>({
    text: link(GONE, ""),
    unresolved: [`${GONE}:`],
    badCites: [],
  }),
  fc.constantFrom(OK_KEY).map((k): Piece => ({
    text: `[@${k}]`,
    unresolved: [],
    badCites: [],
  })),
  fc.constantFrom(TRASHED_KEY, ABSENT_KEY).map((k): Piece => ({
    text: `[@${k}]`,
    unresolved: [],
    badCites: [k],
  })),
  fc.constant<Piece>({
    text: `\n\`\`\`\n${link(GONE, "")} [@${ABSENT_KEY}]\n\`\`\`\n`,
    unresolved: [],
    badCites: [],
  }),
);
const section = fc.array(piece, { maxLength: 6 });
const join = (pieces: readonly Piece[]) => pieces.map((p) => p.text).join("");

const observations: IntegrityObservations = {
  versionFiles: new Map(),
  linked: new Map([[ARTEFACT_RAW, "available"]]),
};

describe("integrity report property (FR-ARC-01)", () => {
  it("reports exactly the unresolved references and source problems that were written", () => {
    fc.assert(
      fc.property(
        fc.record({ methods: section, results_notes: section }),
        section,
        (first, interpretation) => {
          const arranged = arrangedFrom([
            loadedExperiment("EXP-001", "EXP-001", "Q1", {
              methods: join(first.methods),
              results_notes: join(first.results_notes),
              interpretation: join(interpretation),
            }),
          ]);
          const [item] = arranged.unassigned;
          if (item === undefined) throw new Error("fixture");
          item.artefacts = { kind: "file", file: artefacts };

          const findings = buildIntegrityReport(
            arranged,
            bibliography,
            observations,
          );

          const unresolved = new Set(
            [
              ...first.methods,
              ...first.results_notes,
              ...interpretation,
            ].flatMap((p) => p.unresolved),
          );
          expect(
            new Set(
              findings.flatMap((f) =>
                f.kind === "unresolvedReference"
                  ? [`${f.ulid}:${f.version ?? ""}`]
                  : [],
              ),
            ),
          ).toEqual(unresolved);

          // Citations count in Methods and Interpretation only (FR-CIT-09);
          // the trashed entry is always reported, cited or not.
          const cited = new Set(
            [...first.methods, ...interpretation].flatMap((p) => p.badCites),
          );
          const expected = new Set([TRASHED_KEY, ...cited]);
          expect(
            new Set(
              findings.flatMap((f) =>
                f.kind === "sourceProblem" ? [f.citekey] : [],
              ),
            ),
          ).toEqual(expected);

          const keys = findings.map((f) => f.key);
          expect(new Set(keys).size).toBe(keys.length);
        },
      ),
      { numRuns },
    );
  });
});
