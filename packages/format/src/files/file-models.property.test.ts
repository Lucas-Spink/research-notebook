import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { artefactsModel, requestModel } from "../../test/evidence-arbitraries";
import { experimentFile, questionFile } from "../../test/file-arbitraries";
import type { Result } from "../result";
import { parseArtefacts, serialiseArtefacts } from "./artefacts";
import { parseExperiment, serialiseExperiment } from "./experiment";
import { parseQuestion, serialiseQuestion } from "./question";
import { parseRequest, serialiseRequest } from "./request";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

function roundTrips<T>(
  name: string,
  model: () => fc.Arbitrary<T>,
  parse: (text: string) => Result<T>,
  serialise: (value: T) => string,
): void {
  describe(`${name} round-trip`, () => {
    it("parse(serialise(model)) deep-equals model", () => {
      fc.assert(
        fc.property(model(), (value) => {
          const parsed = parse(serialise(value));
          if (!parsed.ok) throw new Error(parsed.error.message);
          expect(parsed.value).toEqual(value);
        }),
        { numRuns },
      );
    });

    it("serialise is canonical: serialise(parse(text)) equals text", () => {
      fc.assert(
        fc.property(model(), (value) => {
          const text = serialise(value);
          const parsed = parse(text);
          if (!parsed.ok) throw new Error(parsed.error.message);
          expect(serialise(parsed.value)).toBe(text);
        }),
        { numRuns },
      );
    });
  });
}

roundTrips("question file", questionFile, parseQuestion, serialiseQuestion);
roundTrips(
  "experiment file",
  experimentFile,
  parseExperiment,
  serialiseExperiment,
);
roundTrips(
  "artefacts.yaml",
  artefactsModel,
  parseArtefacts,
  serialiseArtefacts,
);
roundTrips("request.json", requestModel, parseRequest, serialiseRequest);
