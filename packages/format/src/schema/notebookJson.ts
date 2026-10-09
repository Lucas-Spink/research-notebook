import { z } from "zod";
import {
  ArtefactMode,
  ArtefactRole,
  Count,
  Sha256,
  SingleLine,
  Timestamp,
  Ulid,
} from "./common";
import { ARTEFACT_TYPES } from "./artefacts";
import { EXPERIMENT_STATUSES } from "./experiment";

/**
 * `notebook.json` (FR-ARC-07, ADR-0055): a derived, read-only view of the
 * parsed project for readers that are not this application. It is written
 * under `_notebook/exports/machine/` and never read back, so it is not part of
 * the on-disk format. Its own `schemaVersion` changes when its shape does.
 * Keys are camelCase, unlike the notebook's own files, because it is JSON for
 * programs, not a file a researcher edits.
 */
export const NOTEBOOK_JSON_SCHEMA_VERSION = 1;

const Version = z.object({
  v: z.number().int().min(1),
  /** Relative to the experiment folder, for example `evidence/volcano.png`. */
  file: z.string(),
  sha256: Sha256,
  size: Count,
  captured: Timestamp,
});

const Link = z.object({
  sha256: Sha256,
  size: Count,
  observedMtime: Timestamp,
  checked: Timestamp,
});

const ArtefactJson = z.object({
  id: Ulid,
  name: SingleLine,
  role: ArtefactRole,
  type: z.enum(ARTEFACT_TYPES),
  mode: ArtefactMode,
  /** `project`, or the ULID of an external root. */
  sourceRoot: z.string(),
  sourcePath: z.string(),
  created: Timestamp,
  /** Oldest first. Empty for a linked artefact. */
  versions: z.array(Version),
  /** What was last observed of a linked file; `null` for a captured one. */
  link: Link.nullable(),
});

const GroupJson = z.object({
  id: Ulid,
  name: SingleLine,
  /** Artefact ids. */
  items: z.array(Ulid),
  get groups() {
    return z.array(GroupJson);
  },
});

const SectionJson = z.object({
  /** A recognised section, or `unknown` for one the application keeps as written. */
  key: z.enum(["methods", "results_notes", "interpretation", "unknown"]),
  heading: z.string(),
  markdown: z.string(),
});

const ExperimentJson = z.object({
  id: Ulid,
  ref: z.string(),
  folder: z.string(),
  /** The ID of the question it names, which may have no question file. */
  question: Ulid,
  title: SingleLine,
  status: z.enum(EXPERIMENT_STATUSES),
  started: z.string().nullable(),
  completed: z.string().nullable(),
  created: Timestamp,
  updated: Timestamp,
  preamble: z.string(),
  sections: z.array(SectionJson),
  /** The stored Literature block as written, or `null` when there is none. */
  literature: z.string().nullable(),
  /** Citekeys cited in Methods and Interpretation; the sources are in `bibliography.json`. */
  citekeys: z.array(z.string()),
  artefacts: z.object({
    /** `unreadable`: its `artefacts.yaml` could not be read, so none are listed. */
    state: z.enum(["none", "read", "unreadable"]),
    items: z.array(ArtefactJson),
    groups: z.array(GroupJson),
  }),
  /** The rendering of this experiment, relative to `exports/machine/`. */
  markdown: z.string(),
});

const QuestionJson = z.object({
  id: Ulid,
  ref: z.string(),
  title: SingleLine,
  created: Timestamp,
  motivation: z.string(),
  /** Refs of the experiments under it, in project order. */
  experiments: z.array(z.string()),
  markdown: z.string(),
});

export const NotebookJson = z.object({
  schemaVersion: z.literal(NOTEBOOK_JSON_SCHEMA_VERSION),
  /** UTC, to the second; given by the caller so the file is reproducible. */
  generatedAt: Timestamp,
  generatedBy: z.string(),
  project: z.object({
    id: Ulid,
    name: SingleLine,
    created: Timestamp,
    locale: z.string(),
    citationStyle: z.string(),
    formatVersion: z.number().int(),
    archived: Timestamp.nullable(),
  }),
  questions: z.array(QuestionJson),
  experiments: z.array(ExperimentJson),
  /** Refs left out because another file has the same ID or reference (spec P6). */
  notExported: z.array(z.string()),
});

export type NotebookJsonModel = z.infer<typeof NotebookJson>;

/**
 * The JSON Schema (draft 2020-12) of `notebook.json`, as file text. It is not
 * one of the notebook's data-file schemas in `docs/format/schemas/`: the
 * export carries it beside the file it describes (ADR-0055).
 */
export function renderNotebookJsonSchema(): string {
  const schema = z.toJSONSchema(NotebookJson, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
  });
  return `${JSON.stringify(
    { ...schema, title: "notebook.json (export schema version 1)" },
    null,
    2,
  )}\n`;
}
