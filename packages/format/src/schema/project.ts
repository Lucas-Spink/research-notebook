import { z } from "zod";
import {
  AppVersion,
  Count,
  FileName,
  FormatVersion,
  SingleLine,
  Timestamp,
  Ulid,
} from "./common";

/** Spec 5.3 `table.columns[].key`, in the order the table shows them by default. */
export const COLUMN_KEYS = [
  "motivation",
  "methods",
  "results",
  "results_notes",
  "interpretation",
  "literature",
] as const;

const Capture = z.looseObject({
  copy_threshold_mb: Count,
  evidence_in_git: z.boolean(),
});

const Numbering = z.looseObject({
  next_question: z.number().int().positive(),
  next_experiment: z.number().int().positive(),
});

const OrderEntry = z.looseObject({
  question: Ulid,
  experiments: z.array(Ulid),
});

const Column = z.looseObject({
  key: z.enum(COLUMN_KEYS),
  // CSS pixels. The spec gives no bound, so none is imposed (S2-T01).
  width: z.number().int().positive(),
  hidden: z.boolean(),
});

// Each column appears exactly once; array order is display order.
const Table = z
  .looseObject({
    columns: z.array(Column),
    collapsed_questions: z.array(Ulid),
  })
  .superRefine((table, ctx) => {
    const seen = new Set<string>();
    table.columns.forEach((column, index) => {
      if (seen.has(column.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["columns", index, "key"],
          message: `column ${column.key} is listed more than once`,
        });
      }
      seen.add(column.key);
    });
    for (const key of COLUMN_KEYS) {
      if (!seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["columns"],
          message: `column ${key} is missing`,
        });
      }
    }
  });

const ExternalRoot = z.looseObject({
  id: Ulid,
  label: SingleLine,
});

/** Spec 5.3: `_notebook/project.yaml`. */
export const ProjectYaml = z
  .looseObject({
    format_version: FormatVersion,
    id: Ulid,
    name: SingleLine,
    created: Timestamp,
    last_written_by: AppVersion,
    archived: Timestamp.nullable(),
    // BCP 47 shape only; a regular expression keeps results identical on every platform.
    locale: z
      .string()
      .regex(
        /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/,
        "expected a BCP 47 tag such as en-GB",
      ),
    citation_style: FileName.refine(
      (name) => name.endsWith(".csl"),
      "expected a .csl file name",
    ),
    capture: Capture,
    numbering: Numbering,
    order: z.array(OrderEntry),
    table: Table,
    external_roots: z.array(ExternalRoot),
  })
  .superRefine((project, ctx) => {
    // Cross-file checks (order against files on disk) are not schema errors; see format-v1.md.
    const questions = new Set<string>();
    const experiments = new Set<string>();
    project.order.forEach((entry, entryIndex) => {
      if (questions.has(entry.question)) {
        ctx.addIssue({
          code: "custom",
          path: ["order", entryIndex, "question"],
          message: "question is listed more than once",
        });
      }
      questions.add(entry.question);
      entry.experiments.forEach((id, index) => {
        if (experiments.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["order", entryIndex, "experiments", index],
            message: "experiment is listed more than once",
          });
        }
        experiments.add(id);
      });
    });
    const roots = new Set<string>();
    project.external_roots.forEach((root, index) => {
      if (roots.has(root.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["external_roots", index, "id"],
          message: "external root is listed more than once",
        });
      }
      roots.add(root.id);
    });
  });

export type ProjectYamlModel = z.infer<typeof ProjectYaml>;
