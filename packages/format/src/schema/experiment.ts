import { z } from "zod";
import { ExperimentRef, IsoDate, SingleLine, Timestamp, Ulid } from "./common";

export const EXPERIMENT_STATUSES = [
  "planned",
  "running",
  "complete",
  "abandoned",
] as const;

/** Spec 5.5: frontmatter of `experiments/<ref>/experiment.md`. */
export const ExperimentFrontmatter = z.looseObject({
  id: Ulid,
  ref: ExperimentRef,
  question: Ulid,
  title: SingleLine,
  status: z.enum(EXPERIMENT_STATUSES),
  // Omitted when absent. An explicit null is rejected (decided in S2-T01).
  started: IsoDate.optional(),
  completed: IsoDate.optional(),
  created: Timestamp,
  updated: Timestamp,
});

/** Spec 5.5: the level-2 sections the application recognises, in canonical order. */
export const RECOGNISED_SECTIONS = [
  "methods",
  "results_notes",
  "interpretation",
] as const;

const RecognisedSection = z.object({
  key: z.enum(RECOGNISED_SECTIONS),
  body: z.string(),
});

const UnknownSection = z.object({
  key: z.literal("unknown"),
  // The heading text as written, so an unknown section survives an edit unchanged.
  heading: z.string(),
  body: z.string(),
});

/**
 * Spec 5.5: the parsed body of an experiment file. This is the model shape
 * only; the grammar that produces it is specified in format-v1.md and
 * implemented in S2-T02. Not exported to JSON Schema because the body is
 * Markdown, not a data file.
 */
export const ExperimentBody = z
  .object({
    /** Content before the first recognised heading, preserved unchanged. */
    preamble: z.string(),
    /** Recognised and unknown sections in their original order. */
    sections: z.array(z.union([RecognisedSection, UnknownSection])),
    /** The literature block including its `## Literature` heading, or null when absent. */
    literature: z.string().nullable(),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.sections.forEach((section, index) => {
      if (section.key === "unknown") return;
      if (seen.has(section.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "key"],
          message: `section ${section.key} appears more than once`,
        });
      }
      seen.add(section.key);
    });
  });

export type ExperimentFrontmatterModel = z.infer<typeof ExperimentFrontmatter>;
export type ExperimentBodyModel = z.infer<typeof ExperimentBody>;
