import { citationContext, parseSectionMarkdown } from "../editor";
import type { RecognisedSectionKey } from "../experiment-edit";
import type { ArtefactModel, BibliographyFileModel } from "../schema";
import type { Arranged, ArrangedExperiment } from "./arrange";
import { artefactReferencesIn } from "./references";
import { experimentFolderPath } from "./types";

/** What a linked file's live check found (FR-EVD-07); `unchecked` when no check was made. */
export type LinkAvailability =
  "available" | "missing" | "rootUnresolved" | "rootFolderMissing";

/**
 * What the filesystem said, gathered by the caller because this package does
 * no I/O (AGENTS.md section 4). Version files absent from `versionFiles` were
 * opened without trouble.
 */
export interface IntegrityObservations {
  /** By project-relative path, as `versionFilesOf` listed them. */
  versionFiles: ReadonlyMap<string, "missing" | "unreadable">;
  /** By artefact ID, as `linkedArtefactsOf` listed them. */
  linked: ReadonlyMap<string, LinkAvailability>;
}

interface Where {
  experimentFolder: string;
  experimentRef: string;
}

/**
 * One thing the integrity check found (FR-ARC-01). `key` is stable for the
 * same problem, so the caller can remember that it was acknowledged.
 */
export type IntegrityFinding = { key: string } & (
  | (Where & {
      kind: "missingFile";
      artefactId: string;
      artefactName: string;
      version: number;
      /** Project-relative, from `_notebook/`. */
      path: string;
      /** The file is there but could not be opened. */
      unreadable: boolean;
    })
  | (Where & {
      kind: "unresolvedReference";
      experimentTitle: string;
      section: RecognisedSectionKey;
      ulid: string;
      version: number | null;
      /** The artefact is gone, or the artefact is there but not that version. */
      reason: "artefact" | "version";
      /** Some `artefacts.yaml` could not be read, so the artefact may be in it. */
      mayBeInUnreadableFile: boolean;
    })
  | (Where & {
      kind: "externalFile";
      artefactId: string;
      artefactName: string;
      root: string;
      path: string;
      availability: LinkAvailability | "unchecked";
    })
  | (Where & { kind: "unreadableArtefacts" })
  | {
      kind: "sourceProblem";
      citekey: string;
      state: "trashed" | "missing" | "notInBibliography";
      /** Folders of the experiments citing it, in project order. */
      citedIn: readonly string[];
    }
);

/** A captured version's file, to be opened by the caller. */
export interface VersionFileToCheck {
  experimentFolder: string;
  artefactId: string;
  version: number;
  /** Project-relative, from `_notebook/`. */
  path: string;
}

/** A linked artefact, to have its availability checked by the caller. */
export interface LinkedToCheck {
  artefactId: string;
  root: string;
  path: string;
}

function experimentsOf(arranged: Arranged): ArrangedExperiment[] {
  return [
    ...arranged.questions.flatMap((question) => question.experiments),
    ...arranged.unassigned,
  ];
}

function artefactsIn(item: ArrangedExperiment): readonly ArtefactModel[] {
  return item.artefacts?.kind === "file" ? item.artefacts.file.artefacts : [];
}

/** Every captured version file, in project order (FR-ARC-01 missing files). */
export function versionFilesOf(arranged: Arranged): VersionFileToCheck[] {
  return experimentsOf(arranged).flatMap((item) =>
    artefactsIn(item).flatMap((artefact) =>
      artefact.mode === "copy"
        ? artefact.versions.map((version) => ({
            experimentFolder: item.experiment.folder,
            artefactId: artefact.id,
            version: version.v,
            path: `${experimentFolderPath(item.experiment.folder)}/${version.file}`,
          }))
        : [],
    ),
  );
}

/** Every linked artefact, in project order (FR-ARC-01 external files). */
export function linkedArtefactsOf(arranged: Arranged): LinkedToCheck[] {
  return experimentsOf(arranged).flatMap((item) =>
    artefactsIn(item).flatMap((artefact) =>
      artefact.mode === "link"
        ? [
            {
              artefactId: artefact.id,
              root: artefact.source.root,
              path: artefact.source.path,
            },
          ]
        : [],
    ),
  );
}

function whereOf(item: ArrangedExperiment): Where {
  return {
    experimentFolder: item.experiment.folder,
    experimentRef: item.experiment.file.frontmatter.ref,
  };
}

function missingFiles(
  arranged: Arranged,
  observations: IntegrityObservations,
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  for (const item of experimentsOf(arranged)) {
    for (const artefact of artefactsIn(item)) {
      if (artefact.mode !== "copy") continue;
      for (const version of artefact.versions) {
        const path = `${experimentFolderPath(item.experiment.folder)}/${version.file}`;
        const seen = observations.versionFiles.get(path);
        if (seen === undefined) continue;
        findings.push({
          key: `missingFile:${path}`,
          kind: "missingFile",
          ...whereOf(item),
          artefactId: artefact.id,
          artefactName: artefact.name,
          version: version.v,
          path,
          unreadable: seen === "unreadable",
        });
      }
    }
  }
  return findings;
}

/** Artefact ID to its versions (`null` for a linked artefact), across the project. */
function knownArtefacts(arranged: Arranged): Map<string, number[] | null> {
  const known = new Map<string, number[] | null>();
  for (const item of experimentsOf(arranged)) {
    for (const artefact of artefactsIn(item)) {
      known.set(
        artefact.id,
        artefact.mode === "copy" ? artefact.versions.map((v) => v.v) : null,
      );
    }
  }
  return known;
}

function unresolvedReferences(arranged: Arranged): IntegrityFinding[] {
  const known = knownArtefacts(arranged);
  const items = experimentsOf(arranged);
  const anyUnreadable = items.some((i) => i.artefacts?.kind === "unreadable");
  const findings = new Map<string, IntegrityFinding>();
  for (const item of items) {
    const { frontmatter } = item.experiment.file;
    for (const section of item.experiment.file.body.sections) {
      if (section.key === "unknown") continue;
      for (const { ulid, version } of artefactReferencesIn(
        parseSectionMarkdown(section.body),
      )) {
        const versions = known.get(ulid);
        const reason =
          versions === undefined
            ? "artefact"
            : version !== null &&
                versions !== null &&
                !versions.includes(version)
              ? "version"
              : null;
        if (reason === null) continue;
        const key = `unresolvedReference:${item.experiment.folder}:${section.key}:${ulid}:${version ?? ""}`;
        findings.set(key, {
          key,
          kind: "unresolvedReference",
          ...whereOf(item),
          experimentTitle: frontmatter.title,
          section: section.key,
          ulid,
          version,
          reason,
          mayBeInUnreadableFile: reason === "artefact" && anyUnreadable,
        });
      }
    }
  }
  return [...findings.values()];
}

function externalFiles(
  arranged: Arranged,
  observations: IntegrityObservations,
): IntegrityFinding[] {
  return experimentsOf(arranged).flatMap((item) =>
    artefactsIn(item).flatMap((artefact): IntegrityFinding[] =>
      artefact.mode === "link"
        ? [
            {
              key: `externalFile:${artefact.id}`,
              kind: "externalFile",
              ...whereOf(item),
              artefactId: artefact.id,
              artefactName: artefact.name,
              root: artefact.source.root,
              path: artefact.source.path,
              availability: observations.linked.get(artefact.id) ?? "unchecked",
            },
          ]
        : [],
    ),
  );
}

function unreadableArtefacts(arranged: Arranged): IntegrityFinding[] {
  return experimentsOf(arranged)
    .filter((item) => item.artefacts?.kind === "unreadable")
    .map((item) => ({
      key: `unreadableArtefacts:${item.experiment.folder}`,
      kind: "unreadableArtefacts",
      ...whereOf(item),
    }));
}

function sourceProblems(
  arranged: Arranged,
  bibliography: BibliographyFileModel,
): IntegrityFinding[] {
  const citedIn = new Map<string, string[]>();
  for (const item of experimentsOf(arranged)) {
    for (const cluster of citationContext(item.experiment.file.body)) {
      for (const { citekey } of cluster.items) {
        const folders = citedIn.get(citekey) ?? [];
        if (!folders.includes(item.experiment.folder)) {
          folders.push(item.experiment.folder);
        }
        citedIn.set(citekey, folders);
      }
    }
  }
  const stored = new Map(bibliography.map((item) => [item.id, item]));
  const problems: IntegrityFinding[] = [];
  for (const item of bibliography) {
    const { status } = item._zotero;
    if (status === "ok") continue;
    problems.push({
      key: `sourceProblem:${item.id}`,
      kind: "sourceProblem",
      citekey: item.id,
      state: status,
      citedIn: citedIn.get(item.id) ?? [],
    });
  }
  for (const [citekey, folders] of citedIn) {
    if (stored.has(citekey)) continue;
    problems.push({
      key: `sourceProblem:${citekey}`,
      kind: "sourceProblem",
      citekey,
      state: "notInBibliography",
      citedIn: folders,
    });
  }
  return problems;
}

/**
 * The integrity check (FR-ARC-01): missing files, unresolved references,
 * external files, and missing or trashed sources. Pure: it reads what is
 * already loaded plus `observations`, and writes nothing. Whether a finding
 * is resolved or acknowledged is the caller's to track by `key`.
 */
export function buildIntegrityReport(
  arranged: Arranged,
  bibliography: BibliographyFileModel,
  observations: IntegrityObservations,
): IntegrityFinding[] {
  return [
    ...unreadableArtefacts(arranged),
    ...missingFiles(arranged, observations),
    ...unresolvedReferences(arranged),
    ...externalFiles(arranged, observations),
    ...sourceProblems(arranged, bibliography),
  ];
}
