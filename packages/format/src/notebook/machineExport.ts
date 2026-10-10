import { citationContext } from "../editor";
import {
  NOTEBOOK_JSON_SCHEMA_VERSION,
  renderJsonSchemaFiles,
  renderNotebookJsonSchema,
  type ArtefactModel,
  type GroupModel,
  type NotebookJsonModel,
  type ProjectYamlModel,
} from "../schema";
import type { Arranged, ArrangedExperiment } from "./arrange";
import { latestVersion, linkedHref, versionHref } from "./htmlArtefacts";
import { selectExported } from "./htmlExport";
import {
  experimentMarkdown,
  markdownPath,
  SECTION_TITLES,
  questionMarkdown,
  type MarkdownRefLinks,
} from "./machineMarkdown";

/** One file of the machine-readable export, named relative to `_notebook/exports/machine/`. */
export interface MachineFile {
  name: string;
  text: string;
}

export interface MachineExportInput {
  arranged: Arranged;
  project: ProjectYamlModel;
  /** The running application's version, recorded as `generatedBy`. */
  appVersion: string;
  /** Read once, so the files are the same however long building them takes. */
  now: () => Date;
}

type Experiments = ReturnType<typeof selectExported>["experiments"];

function timestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/u, "Z");
}

function artefactJson(artefact: ArtefactModel) {
  const common = {
    id: artefact.id,
    name: artefact.name,
    role: artefact.role,
    type: artefact.type,
    mode: artefact.mode,
    sourceRoot: artefact.source.root,
    sourcePath: artefact.source.path,
    created: artefact.created,
  };
  if (artefact.mode === "link") {
    return {
      ...common,
      versions: [],
      link: {
        sha256: artefact.link.sha256,
        size: artefact.link.size,
        observedMtime: artefact.link.observed_mtime,
        checked: artefact.link.checked,
      },
    };
  }
  return {
    ...common,
    versions: artefact.versions.map((v) => ({
      v: v.v,
      file: v.file,
      sha256: v.sha256,
      size: v.size,
      captured: v.captured,
    })),
    link: null,
  };
}

function groupJson(
  group: GroupModel,
): NotebookJsonModel["experiments"][number]["artefacts"]["groups"][number] {
  return {
    id: group.id,
    name: group.name,
    items: [...group.items],
    groups: group.groups.map(groupJson),
  };
}

function citekeysOf(item: ArrangedExperiment): string[] {
  const keys = citationContext(item.experiment.file.body).flatMap((cluster) =>
    cluster.items.map((c) => c.citekey),
  );
  return [...new Set(keys)];
}

function experimentJson(
  item: ArrangedExperiment,
): NotebookJsonModel["experiments"][number] {
  const { frontmatter: f, body } = item.experiment.file;
  const artefacts = item.artefacts;
  return {
    id: f.id,
    ref: f.ref,
    folder: item.experiment.folder,
    question: f.question,
    title: f.title,
    status: f.status,
    started: f.started ?? null,
    completed: f.completed ?? null,
    created: f.created,
    updated: f.updated,
    preamble: body.preamble,
    sections: body.sections.map((s) => ({
      key: s.key,
      heading: s.key === "unknown" ? s.heading : SECTION_TITLES[s.key],
      markdown: s.body,
    })),
    literature: body.literature,
    citekeys: citekeysOf(item),
    artefacts:
      artefacts?.kind === "file"
        ? {
            state: "read",
            items: artefacts.file.artefacts.map(artefactJson),
            groups: artefacts.file.groups.map(groupJson),
          }
        : {
            state: artefacts?.kind === "unreadable" ? "unreadable" : "none",
            items: [],
            groups: [],
          },
    markdown: markdownPath(f.ref),
  };
}

/** Where a reference leads from a rendering in `exports/machine/markdown/`. */
function markdownRefs(experiments: Experiments): MarkdownRefLinks {
  const found = new Map<string, { artefact: ArtefactModel; folder: string }>();
  for (const item of experiments) {
    if (item.artefacts?.kind !== "file") continue;
    for (const artefact of item.artefacts.file.artefacts) {
      found.set(artefact.id, { artefact, folder: item.experiment.folder });
    }
  }
  return (ulid, version) => {
    const hit = found.get(ulid);
    if (hit === undefined) return null;
    const { artefact, folder } = hit;
    if (artefact.mode === "link") {
      const href = linkedHref(artefact.source);
      return href === null ? null : `../${href}`;
    }
    const chosen =
      version === null
        ? latestVersion(artefact)
        : artefact.versions.find((v) => v.v === version);
    return chosen === undefined
      ? null
      : `../${versionHref(folder, chosen.file)}`;
  };
}

/**
 * Builds the machine-readable export (FR-ARC-07, ADR-0055): `notebook.json`,
 * the JSON Schemas it and the notebook's files follow, and a Markdown
 * rendering of every question and experiment. Pure: it reads nothing, and the
 * clock is the caller's. `notebook.json` is the last file, so an interrupted
 * write never leaves a new `notebook.json` naming renderings that are not
 * there. Duplicates of an ID or reference are named in `notExported`, as in
 * the HTML export.
 */
export function buildMachineExport(input: MachineExportInput): MachineFile[] {
  const shown = selectExported(input.arranged);
  const refs = markdownRefs(shown.experiments);
  const questionOf = new Map<ArrangedExperiment, string>();
  for (const q of shown.questions) {
    for (const e of q.experiments) {
      questionOf.set(e, q.question.file.frontmatter.ref);
    }
  }
  const { project } = input;
  const notebook: NotebookJsonModel = {
    schemaVersion: NOTEBOOK_JSON_SCHEMA_VERSION,
    generatedAt: timestamp(input.now()),
    generatedBy: input.appVersion,
    project: {
      id: project.id,
      name: project.name,
      created: project.created,
      locale: project.locale,
      citationStyle: project.citation_style,
      formatVersion: project.format_version,
      archived: project.archived,
    },
    questions: shown.questions.map((q) => {
      const f = q.question.file.frontmatter;
      return {
        id: f.id,
        ref: f.ref,
        title: f.title,
        created: f.created,
        motivation: q.question.file.body,
        experiments: q.experiments.map(
          (e) => e.experiment.file.frontmatter.ref,
        ),
        markdown: markdownPath(f.ref),
      };
    }),
    experiments: shown.experiments.map(experimentJson),
    notExported: shown.skipped,
  };
  const schemas = [
    ...Object.entries(renderJsonSchemaFiles()),
    ["notebook.schema.json", renderNotebookJsonSchema()],
  ].map(([name, text]) => ({ name: `schemas/${name}`, text: text ?? "" }));
  const renderings: MachineFile[] = [
    ...shown.questions.map((q) => ({
      name: markdownPath(q.question.file.frontmatter.ref),
      text: questionMarkdown(q, refs),
    })),
    ...shown.experiments.map((e) => ({
      name: markdownPath(e.experiment.file.frontmatter.ref),
      text: experimentMarkdown(e, questionOf.get(e) ?? null, refs),
    })),
  ];
  return [
    ...schemas,
    ...renderings,
    { name: "notebook.json", text: `${JSON.stringify(notebook, null, 2)}\n` },
  ];
}
