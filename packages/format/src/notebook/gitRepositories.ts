import type { Arranged } from "./arrange";
import { experimentsOf } from "./manifest";

/** A repository that captured versions cite through their provenance. */
export interface GitRepository {
  /** `.` or a forward-only path relative to the project root (spec 5.8). */
  repo: string;
  /** The commits versions were captured at, sorted and without repeats. */
  commits: string[];
}

/**
 * The repositories referenced by provenance (FR-ARC-04), one entry each,
 * sorted by path so the same project gives the same list. Versions captured
 * outside a repository have no provenance and contribute nothing. Linked
 * artefacts record no provenance (spec 5.8).
 */
export function gitRepositories(arranged: Arranged): GitRepository[] {
  const commitsByRepo = new Map<string, Set<string>>();
  for (const item of experimentsOf(arranged)) {
    if (item.artefacts?.kind !== "file") continue;
    for (const artefact of item.artefacts.file.artefacts) {
      if (artefact.mode !== "copy") continue;
      for (const { provenance } of artefact.versions) {
        if (provenance === undefined) continue;
        const commits = commitsByRepo.get(provenance.repo) ?? new Set<string>();
        commits.add(provenance.commit);
        commitsByRepo.set(provenance.repo, commits);
      }
    }
  }
  return [...commitsByRepo.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([repo, commits]) => ({ repo, commits: [...commits].sort() }));
}
