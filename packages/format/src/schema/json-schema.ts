import { z } from "zod";
import { ArtefactsFile } from "./artefacts";
import { BibliographyFile } from "./bibliography";
import { ExperimentFrontmatter } from "./experiment";
import { LockFile } from "./lock";
import { ProjectYaml } from "./project";
import { QuestionFrontmatter } from "./question";
import { InboxRequest } from "./request";

/** One entry per notebook data file; the key is the exported schema's file stem. */
const SCHEMAS = {
  artefacts: {
    schema: ArtefactsFile,
    title: "artefacts.yaml (format version 1)",
  },
  bibliography: {
    schema: BibliographyFile,
    title: "bibliography.json (format version 1)",
  },
  experiment: {
    schema: ExperimentFrontmatter,
    title: "experiment.md frontmatter (format version 1)",
  },
  lock: { schema: LockFile, title: ".lock (format version 1)" },
  project: { schema: ProjectYaml, title: "project.yaml (format version 1)" },
  question: {
    schema: QuestionFrontmatter,
    title: "question file frontmatter (format version 1)",
  },
  request: {
    schema: InboxRequest,
    title: "inbox request.json (format version 1)",
  },
} as const;

const DESCRIPTION =
  "Structural constraints only. Cross-entry and cross-file rules are listed in docs/format/format-v1.md.";

/**
 * JSON Schema (draft 2020-12) for every notebook data file, as file name to
 * file text. Pure: docs/format/schemas/ is written by
 * scripts/export-format-schemas.mjs, never by this package (no I/O here).
 * Refinements such as uniqueness cannot be expressed in JSON Schema and are
 * dropped; the Zod schemas remain the executable authority.
 */
export function renderJsonSchemaFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [stem, { schema, title }] of Object.entries(SCHEMAS)) {
    const jsonSchema = z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io: "input",
      unrepresentable: "any",
    });
    files[`${stem}.schema.json`] =
      `${JSON.stringify({ ...jsonSchema, title, description: DESCRIPTION }, null, 2)}\n`;
  }
  return files;
}
