import type { ArtefactModel, ArtefactsFileModel, GroupModel } from "../schema";
import type { ArrangedExperiment, ArrangedQuestion } from "./arrange";
import { linkedHref, urlPath, versionHref } from "./htmlArtefacts";
import { HTML_EXPORT_TEXT as T } from "./htmlExportText";

/**
 * Markdown renderings of the notebook (FR-ARC-07, ADR-0055): one file per
 * question and per experiment, with every section written out. Files sit in
 * `_notebook/exports/machine/markdown/`, one folder deeper than the HTML
 * pages, so every link to an original begins one `../` further up.
 */

/** Where a reference to an artefact leads from a rendering, or `null` when it is not part of the export. */
export type MarkdownRefLinks = (
  ulid: string,
  version: number | null,
) => string | null;

const MARKDOWN_SPECIALS = /[\\`*_[\]<>]/gu;

/** Text that reads as itself when the rendering is read as Markdown. */
function plain(text: string): string {
  return text.replace(MARKDOWN_SPECIALS, (char) => `\\${char}`);
}

const fromMarkdownFolder = (href: string): string => `../${href}`;

const ARTEFACT_LINK =
  /\[([^\]\n]*)\]\((<[^>\n]*>|[^\s()\n]+)(\s+"art:([^"\n]*)")\)/gu;

/**
 * Points each artefact reference at the original file, keeping its `art:`
 * title so the text is still a reference. One that cannot be resolved is left
 * as written.
 */
export function rewriteReferences(
  markdown: string,
  refs: MarkdownRefLinks,
): string {
  return markdown.replace(
    ARTEFACT_LINK,
    (
      whole: string,
      label: string,
      _dest: string,
      title: string,
      body: string,
    ) => {
      const parts = /^([0-9A-Z]{26})(?: v(\d+))?$/u.exec(body);
      const ulid = parts?.[1];
      if (ulid === undefined) return whole;
      const version = parts?.[2];
      const href = refs(ulid, version === undefined ? null : Number(version));
      return href === null ? whole : `[${label}](${href}${title})`;
    },
  );
}

/** The stored Literature block without its heading and markers, which the rendering supplies. */
function literatureBody(block: string): string {
  return block
    .split("\n")
    .filter(
      (line) =>
        !/^<!--\s*literature:(?:start|end)\s*-->$/u.test(line.trim()) &&
        !/^##\s+literature\s*$/iu.test(line.trim()),
    )
    .join("\n")
    .trim();
}

function artefactLine(artefact: ArtefactModel, folder: string): string {
  const name = plain(artefact.name);
  const kind = `${artefact.type}, ${artefact.role}`;
  if (artefact.mode === "link") {
    const href = linkedHref(artefact.source);
    const shown =
      href === null
        ? `\`${artefact.source.path}\``
        : `[\`${artefact.source.path}\`](${fromMarkdownFolder(href)})`;
    return `- ${name} (${kind}) — ${T.linked}: ${shown}`;
  }
  const versions = artefact.versions
    .map(
      (v) =>
        `[${T.version} ${v.v}](${fromMarkdownFolder(versionHref(folder, v.file))})`,
    )
    .join(", ");
  return `- ${name} (${kind}) — ${versions}`;
}

function groupLines(
  group: GroupModel,
  depth: number,
  byId: ReadonlyMap<string, ArtefactModel>,
  line: (artefact: ArtefactModel) => string,
): string[] {
  const lines = [
    `${"#".repeat(Math.min(3 + depth, 6))} ${plain(group.name)}`,
    "",
  ];
  for (const id of group.items) {
    const artefact = byId.get(id);
    if (artefact !== undefined) lines.push(line(artefact));
  }
  lines.push("");
  for (const child of group.groups) {
    lines.push(...groupLines(child, depth + 1, byId, line));
  }
  return lines;
}

function groupedIds(groups: readonly GroupModel[]): Set<string> {
  const ids = new Set<string>();
  const visit = (group: GroupModel): void => {
    group.items.forEach((id) => ids.add(id));
    group.groups.forEach(visit);
  };
  groups.forEach(visit);
  return ids;
}

/** The Artefacts section: results in groups, then results in none, then methods files. */
function artefactsMarkdown(file: ArtefactsFileModel, folder: string): string {
  const byId = new Map(file.artefacts.map((a) => [a.id, a]));
  const line = (artefact: ArtefactModel): string =>
    artefactLine(artefact, folder);
  const results = file.artefacts.filter((a) => a.role === "result");
  const methods = file.artefacts.filter((a) => a.role === "method");
  const inGroups = groupedIds(file.groups);
  const loose = results.filter((a) => !inGroups.has(a.id));
  const lines: string[] = [];
  if (results.length > 0) {
    lines.push(`### ${T.resultFiles}`, "");
    for (const group of file.groups) {
      lines.push(...groupLines(group, 1, byId, line));
    }
    if (loose.length > 0) {
      if (file.groups.length > 0) lines.push(`#### ${T.ungrouped}`, "");
      lines.push(...loose.map(line), "");
    }
  }
  if (methods.length > 0) {
    lines.push(`### ${T.methodFiles}`, "", ...methods.map(line), "");
  }
  return lines.join("\n").trim();
}

export const SECTION_TITLES = {
  methods: T.methods,
  results_notes: T.resultsNotes,
  interpretation: T.interpretation,
} as const;

/** The name a rendering is stored under, relative to `exports/machine/`. */
export function markdownPath(ref: string): string {
  return `markdown/${ref}.md`;
}

/** One experiment, every section written out. */
export function experimentMarkdown(
  item: ArrangedExperiment,
  questionRef: string | null,
  refs: MarkdownRefLinks,
): string {
  const { frontmatter: f, body } = item.experiment.file;
  const rewrite = (text: string): string => rewriteReferences(text, refs);
  const facts = [
    `- ${T.status}: ${f.status}`,
    questionRef === null ? "" : `- ${T.question}: ${questionRef}`,
    f.started === undefined ? "" : `- ${T.started}: ${f.started}`,
    f.completed === undefined ? "" : `- ${T.completed}: ${f.completed}`,
  ].filter((fact) => fact !== "");
  const parts = [`# ${f.ref} ${plain(f.title)}`, facts.join("\n")];
  if (body.preamble.trim() !== "") parts.push(rewrite(body.preamble.trim()));
  for (const section of body.sections) {
    const heading =
      section.key === "unknown" ? section.heading : SECTION_TITLES[section.key];
    const text = rewrite(section.body.trim());
    parts.push(`## ${heading}${text === "" ? "" : `\n\n${text}`}`);
  }
  if (item.artefacts?.kind === "unreadable") {
    parts.push(`## ${T.artefacts}\n\n${T.unreadable}`);
  } else if (item.artefacts?.kind === "file") {
    const text = artefactsMarkdown(item.artefacts.file, item.experiment.folder);
    if (text !== "") parts.push(`## ${T.artefacts}\n\n${text}`);
  }
  if (body.literature !== null) {
    const text = rewrite(literatureBody(body.literature));
    parts.push(`## ${T.literature}${text === "" ? "" : `\n\n${text}`}`);
  }
  return `${parts.join("\n\n")}\n`;
}

/** One question: its Motivation and the experiments under it. */
export function questionMarkdown(
  q: ArrangedQuestion,
  refs: MarkdownRefLinks,
): string {
  const { ref, title } = q.question.file.frontmatter;
  const parts = [`# ${ref} ${plain(title)}`];
  const motivation = rewriteReferences(q.question.file.body.trim(), refs);
  parts.push(
    `## ${T.motivation}${motivation === "" ? "" : `\n\n${motivation}`}`,
  );
  if (q.experiments.length > 0) {
    const items = q.experiments.map((e) => {
      const f = e.experiment.file.frontmatter;
      return `- [${f.ref}](${urlPath([f.ref])}.md) ${plain(f.title)}`;
    });
    parts.push(`## ${T.experiments}\n\n${items.join("\n")}`);
  }
  return `${parts.join("\n\n")}\n`;
}
