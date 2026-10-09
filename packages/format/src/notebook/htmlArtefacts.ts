import type { ArtefactModel, ArtefactsFileModel, GroupModel } from "../schema";
import { escapeHtml } from "./htmlMarkdown";
import { HTML_EXPORT_TEXT as T } from "./htmlExportText";
import { experimentFolderPath } from "./types";

/** What the filesystem helper made of one captured figure or table. */
export type ExportAsset =
  /** A reduced copy of an image, written under `exports/html/`; `src` is relative to the page. */
  | { kind: "image"; src: string; width: number; height: number }
  /** The first rows of a delimited table. `totalRows` is known only when the whole file was read. */
  | {
      kind: "table";
      header: readonly string[];
      rows: readonly (readonly string[])[];
      moreRows: boolean;
      moreColumns: boolean;
      totalRows: number | null;
    }
  /** Asked for, but missing, too large or unreadable. */
  | { kind: "unavailable" }
  /** Nothing to show for this file; it is only linked. */
  | { kind: "none" };

type CopyArtefact = Extract<ArtefactModel, { mode: "copy" }>;
type CopyVersion = CopyArtefact["versions"][number];

/** A URL path from project-relative segments, each encoded so no name can change its meaning. */
export function urlPath(segments: readonly string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

/** Link from a page in `_notebook/exports/html/` to a captured version file. */
export function versionHref(folder: string, file: string): string {
  return `../../${urlPath(["experiments", folder, ...file.split("/")])}`;
}

/** The project-relative path of a captured version file, as the assets are keyed. */
export function versionKey(folder: string, file: string): string {
  return `${experimentFolderPath(folder)}/${file}`;
}

/** Link to a linked file inside the project, from a page in `_notebook/exports/html/`; `null` for any other. */
export function linkedHref(source: {
  root: string;
  path: string;
}): string | null {
  if (source.root !== "project") return null;
  const parts = source.path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  return `../../../${urlPath(parts)}`;
}

/** The newest version of a captured artefact. Versions ascend (spec 5.8). */
export function latestVersion(artefact: CopyArtefact): CopyVersion {
  const last = artefact.versions[artefact.versions.length - 1];
  if (last === undefined) throw new Error("a captured artefact has a version");
  return last;
}

const link = (href: string, inner: string): string =>
  `<a href="${escapeHtml(href)}">${inner}</a>`;

function tableHtml(asset: Extract<ExportAsset, { kind: "table" }>): string {
  const head = asset.header.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = asset.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  const notes = [
    asset.moreRows ? T.moreRows : "",
    asset.moreColumns ? T.moreColumns : "",
  ].filter((note) => note !== "");
  const total =
    asset.totalRows === null
      ? ""
      : `<p class="more">${asset.totalRows} ${T.rows}.</p>`;
  const more = notes
    .map((n) => `<p class="more">${escapeHtml(n)}</p>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${total}${more}`;
}

function preview(
  artefact: CopyArtefact,
  folder: string,
  latest: CopyVersion,
  asset: ExportAsset | undefined,
): string {
  const original = versionHref(folder, latest.file);
  const alt = escapeHtml(artefact.name);
  if (artefact.type === "svg") {
    // Shown as an image, which a browser never lets run scripts, and not downscaled: it is vector.
    return link(original, `<img src="${escapeHtml(original)}" alt="${alt}">`);
  }
  if (asset?.kind === "image") {
    const img = `<img src="${escapeHtml(asset.src)}" width="${asset.width}" height="${asset.height}" alt="${alt}">`;
    return link(original, img);
  }
  if (asset?.kind === "table") return tableHtml(asset);
  if (asset?.kind === "unavailable") {
    return `<p class="note">${T.noPreview}</p>`;
  }
  return "";
}

function versionItem(folder: string, version: CopyVersion): string {
  const label = `${T.version} ${version.v}: ${escapeHtml(version.file)}`;
  const facts = `${T.captured} ${escapeHtml(version.captured)}, ${version.size} ${T.bytes}`;
  return `<li>${link(versionHref(folder, version.file), label)} (${facts})</li>`;
}

function artefactHtml(
  artefact: ArtefactModel,
  folder: string,
  assets: ReadonlyMap<string, ExportAsset>,
): string {
  const name = `<figcaption>${escapeHtml(artefact.name)}</figcaption>`;
  if (artefact.mode === "link") {
    const href = linkedHref(artefact.source);
    const path = `<code>${escapeHtml(artefact.source.path)}</code>`;
    const shown = href === null ? path : link(href, path);
    return `<figure class="artefact">${name}<p>${T.linked}: ${shown}</p></figure>`;
  }
  const latest = latestVersion(artefact);
  const shown = preview(
    artefact,
    folder,
    latest,
    assets.get(versionKey(folder, latest.file)),
  );
  const versions = artefact.versions
    .map((v) => versionItem(folder, v))
    .join("");
  return `<figure class="artefact">${name}${shown}<ul class="versions">${versions}</ul></figure>`;
}

function groupHtml(
  group: GroupModel,
  depth: number,
  byId: ReadonlyMap<string, ArtefactModel>,
  render: (artefact: ArtefactModel) => string,
): string {
  const level = Math.min(3 + depth, 6);
  const items = group.items
    .map((id) => byId.get(id))
    .flatMap((artefact) => (artefact === undefined ? [] : [render(artefact)]));
  const nested = group.groups.map((g) => groupHtml(g, depth + 1, byId, render));
  return `<section><h${level}>${escapeHtml(group.name)}</h${level}>${items.join("")}${nested.join("")}</section>`;
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

/**
 * The Artefacts section of an experiment page: results in the experiment's
 * groups, then results in none, then the methods files. Every captured
 * version is linked to its original; the newest is shown as a reduced figure
 * or a sampled table where `assets` has one.
 */
export function artefactsHtml(
  file: ArtefactsFileModel,
  folder: string,
  assets: ReadonlyMap<string, ExportAsset>,
): string {
  const byId = new Map(file.artefacts.map((a) => [a.id, a]));
  const render = (artefact: ArtefactModel): string =>
    artefactHtml(artefact, folder, assets);
  const results = file.artefacts.filter((a) => a.role === "result");
  const methods = file.artefacts.filter((a) => a.role === "method");
  const inGroups = groupedIds(file.groups);
  const loose = results.filter((a) => !inGroups.has(a.id));
  const parts: string[] = [];
  const heading = (text: string): string => `<h3>${text}</h3>`;
  if (results.length > 0) {
    parts.push(heading(T.resultFiles));
    parts.push(...file.groups.map((g) => groupHtml(g, 1, byId, render)));
    if (loose.length > 0) {
      const label = file.groups.length > 0 ? `<h4>${T.ungrouped}</h4>` : "";
      parts.push(`<section>${label}${loose.map(render).join("")}</section>`);
    }
  }
  if (methods.length > 0) {
    parts.push(heading(T.methodFiles), ...methods.map(render));
  }
  return parts.join("");
}
