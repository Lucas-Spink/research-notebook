import type { ArtefactModel } from "../schema";
import type { Arranged, ArrangedExperiment, ArrangedQuestion } from "./arrange";
import {
  artefactsHtml,
  latestVersion,
  linkedHref,
  versionHref,
  versionKey,
  type ExportAsset,
} from "./htmlArtefacts";
import { HTML_EXPORT_TEXT as T } from "./htmlExportText";
import { escapeHtml, renderMarkdownHtml, type RefLinks } from "./htmlMarkdown";
import { HTML_EXPORT_STYLE } from "./htmlExportStyle";
import { experimentsOf } from "./manifest";

export type { ExportAsset } from "./htmlArtefacts";

/** One file of the export, named relative to `_notebook/exports/html/`. */
export interface HtmlPage {
  name: string;
  html: string;
}

export interface HtmlExportInput {
  arranged: Arranged;
  projectName: string;
  /** BCP 47, from `project.yaml`; becomes the pages' `lang`. */
  locale: string;
  /** By project-relative path of the version file, as `htmlAssetRequests` listed them. */
  assets: ReadonlyMap<string, ExportAsset>;
}

/** A figure or table the filesystem helper should prepare. */
export interface HtmlAssetRequest {
  /** Project-relative path of the captured version file. */
  path: string;
  /** Names the reduced copy, so the same content is written once. */
  sha256: string;
  kind: "image" | "table";
}

type Exported = {
  questions: ArrangedQuestion[];
  experiments: ArrangedExperiment[];
  skipped: string[];
};

/**
 * What is exported: everything except a question or experiment that shares an
 * ID with an earlier one (spec P6) or whose page name an earlier one took.
 * Those are named on the index, never dropped silently.
 */
function selectExported(arranged: Arranged): Exported {
  const taken = new Set<string>(["index"]);
  const skipped: string[] = [];
  const free = (ref: string, readOnly: boolean): boolean => {
    if (readOnly || taken.has(ref)) {
      skipped.push(ref);
      return false;
    }
    taken.add(ref);
    return true;
  };
  const questions = arranged.questions.filter((q) =>
    free(q.question.file.frontmatter.ref, q.readOnly),
  );
  const keep = (e: ArrangedExperiment): boolean =>
    free(e.experiment.file.frontmatter.ref, e.readOnly);
  const kept = new Map(
    questions.map((q) => [q, q.experiments.filter(keep)] as const),
  );
  const unassigned = arranged.unassigned.filter(keep);
  const all = [...questions.flatMap((q) => kept.get(q) ?? []), ...unassigned];
  return {
    questions: questions.map((q) => ({ ...q, experiments: kept.get(q) ?? [] })),
    experiments: all,
    skipped,
  };
}

/**
 * The newest image and table of every exported experiment: the figures and
 * samples the pages show. Older versions are only linked.
 */
export function htmlAssetRequests(arranged: Arranged): HtmlAssetRequest[] {
  const requests: HtmlAssetRequest[] = [];
  for (const item of selectExported(arranged).experiments) {
    if (item.artefacts?.kind !== "file") continue;
    for (const artefact of item.artefacts.file.artefacts) {
      if (artefact.mode !== "copy") continue;
      if (artefact.type !== "image" && artefact.type !== "table") continue;
      const latest = latestVersion(artefact);
      requests.push({
        path: versionKey(item.experiment.folder, latest.file),
        sha256: latest.sha256,
        kind: artefact.type,
      });
    }
  }
  return requests;
}

function shell(input: HtmlExportInput, title: string, body: string): string {
  const lang = escapeHtml(input.locale);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${HTML_EXPORT_STYLE}</style>
</head>
<body>
<header><a href="index.html">${escapeHtml(input.projectName)}</a></header>
<main>
${body}
</main>
<footer>${T.generated}</footer>
</body>
</html>
`;
}

function pageLink(ref: string, title: string): string {
  return `<a href="${escapeHtml(ref)}.html">${escapeHtml(ref)}</a> ${escapeHtml(title)}`;
}

function indexPage(input: HtmlExportInput, shown: Exported): HtmlPage {
  const experimentItem = (e: ArrangedExperiment): string => {
    const { ref, title, status } = e.experiment.file.frontmatter;
    return `<li>${pageLink(ref, title)} <span class="status">${escapeHtml(status)}</span></li>`;
  };
  const sections = shown.questions.map((q) => {
    const { ref, title } = q.question.file.frontmatter;
    const list = q.experiments.map(experimentItem).join("");
    return `<li>${pageLink(ref, title)}<ul>${list}</ul></li>`;
  });
  const loose = shown.experiments.filter((e) =>
    input.arranged.unassigned.includes(e),
  );
  const parts = [`<h1>${escapeHtml(input.projectName)}</h1>`];
  if (sections.length > 0) {
    parts.push(`<h2>${T.questions}</h2><ul>${sections.join("")}</ul>`);
  }
  if (loose.length > 0) {
    parts.push(
      `<h2>${T.noQuestion}</h2><ul>${loose.map(experimentItem).join("")}</ul>`,
    );
  }
  if (shown.skipped.length > 0) {
    const items = shown.skipped
      .map((r) => `<li>${escapeHtml(r)}</li>`)
      .join("");
    parts.push(
      `<h2>${T.notExported}</h2><p>${T.notExportedWhy}</p><ul>${items}</ul>`,
    );
  }
  return {
    name: "index.html",
    html: shell(input, input.projectName, parts.join("\n")),
  };
}

function questionPage(
  input: HtmlExportInput,
  q: ArrangedQuestion,
  refs: RefLinks,
): HtmlPage {
  const { ref, title } = q.question.file.frontmatter;
  const motivation = renderMarkdownHtml(q.question.file.body, refs);
  const items = q.experiments
    .map((e) => {
      const f = e.experiment.file.frontmatter;
      return `<li>${pageLink(f.ref, f.title)} <span class="status">${escapeHtml(f.status)}</span></li>`;
    })
    .join("");
  const body = [
    `<h1>${escapeHtml(ref)} ${escapeHtml(title)}</h1>`,
    motivation === "" ? "" : `<h2>${T.motivation}</h2>${motivation}`,
    items === "" ? "" : `<h2>${T.experiments}</h2><ul>${items}</ul>`,
  ].join("\n");
  return { name: `${ref}.html`, html: shell(input, `${ref} ${title}`, body) };
}

const SECTION_TITLES = {
  methods: T.methods,
  results_notes: T.resultsNotes,
  interpretation: T.interpretation,
} as const;

/** The stored Literature block without its heading and markers, which the page supplies. */
function literatureMarkdown(block: string): string {
  return block
    .split("\n")
    .filter(
      (line) =>
        !/^<!--\s*literature:(?:start|end)\s*-->$/u.test(line.trim()) &&
        !/^##\s+literature\s*$/iu.test(line.trim()),
    )
    .join("\n");
}

function experimentPage(
  input: HtmlExportInput,
  item: ArrangedExperiment,
  questionRef: string | null,
  refs: RefLinks,
): HtmlPage {
  const { frontmatter: f, body } = item.experiment.file;
  const facts = [
    `<dt>${T.status}</dt><dd>${escapeHtml(f.status)}</dd>`,
    f.started === undefined
      ? ""
      : `<dt>${T.started}</dt><dd>${escapeHtml(f.started)}</dd>`,
    f.completed === undefined
      ? ""
      : `<dt>${T.completed}</dt><dd>${escapeHtml(f.completed)}</dd>`,
  ].join("");
  const parts = [
    `<h1>${escapeHtml(f.ref)} ${escapeHtml(f.title)}</h1>`,
    questionRef === null
      ? ""
      : `<p>${T.question}: <a href="${escapeHtml(questionRef)}.html">${escapeHtml(questionRef)}</a></p>`,
    `<dl>${facts}</dl>`,
    renderMarkdownHtml(body.preamble, refs),
  ];
  for (const section of body.sections) {
    const html = renderMarkdownHtml(section.body, refs);
    if (html === "") continue;
    const heading =
      section.key === "unknown" ? section.heading : SECTION_TITLES[section.key];
    parts.push(`<section><h2>${escapeHtml(heading)}</h2>${html}</section>`);
  }
  const folder = item.experiment.folder;
  if (item.artefacts?.kind === "unreadable") {
    parts.push(
      `<section><h2>${T.artefacts}</h2><p class="note">${T.unreadable}</p></section>`,
    );
  } else if (item.artefacts?.kind === "file") {
    const html = artefactsHtml(item.artefacts.file, folder, input.assets);
    if (html !== "")
      parts.push(`<section><h2>${T.artefacts}</h2>${html}</section>`);
  }
  if (body.literature !== null) {
    const html = renderMarkdownHtml(literatureMarkdown(body.literature), refs);
    if (html !== "")
      parts.push(`<section><h2>${T.literature}</h2>${html}</section>`);
  }
  return {
    name: `${f.ref}.html`,
    html: shell(
      input,
      `${f.ref} ${f.title}`,
      parts.filter((p) => p !== "").join("\n"),
    ),
  };
}

/** Where a reference to an artefact leads, project-wide: references may name another experiment's artefact. */
function referenceLinks(shown: Exported): RefLinks {
  const found = new Map<string, { artefact: ArtefactModel; folder: string }>();
  for (const item of shown.experiments) {
    if (item.artefacts?.kind !== "file") continue;
    for (const artefact of item.artefacts.file.artefacts) {
      found.set(artefact.id, { artefact, folder: item.experiment.folder });
    }
  }
  return (ulid, version) => {
    const hit = found.get(ulid);
    if (hit === undefined) return null;
    const { artefact, folder } = hit;
    if (artefact.mode === "link") return linkedHref(artefact.source);
    const chosen =
      version === null
        ? latestVersion(artefact)
        : artefact.versions.find((v) => v.v === version);
    return chosen === undefined ? null : versionHref(folder, chosen.file);
  };
}

/**
 * Builds the static HTML export (FR-ARC-05): an index, a page per question
 * and a page per experiment, in that order. Pure: it reads nothing, and the
 * pages link to the original files by paths relative to
 * `_notebook/exports/html/`. No script, remote font or network address is
 * written, and all user text is escaped.
 */
export function renderHtmlExport(input: HtmlExportInput): HtmlPage[] {
  const shown = selectExported(input.arranged);
  const refs = referenceLinks(shown);
  const questionOf = new Map<ArrangedExperiment, string>();
  for (const q of shown.questions) {
    for (const e of q.experiments) {
      questionOf.set(e, q.question.file.frontmatter.ref);
    }
  }
  const pages: HtmlPage[] = [indexPage(input, shown)];
  for (const q of shown.questions) {
    pages.push(questionPage(input, q, refs));
    for (const e of q.experiments) {
      pages.push(experimentPage(input, e, questionOf.get(e) ?? null, refs));
    }
  }
  for (const e of experimentsOf(input.arranged)) {
    if (questionOf.has(e) || !shown.experiments.includes(e)) continue;
    pages.push(experimentPage(input, e, null, refs));
  }
  return pages;
}
