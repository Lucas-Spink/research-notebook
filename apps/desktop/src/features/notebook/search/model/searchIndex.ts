import {
  summariseMarkdown,
  type Arranged,
  type ArtefactsFileModel,
  type LoadedExperiment,
  type LoadedQuestion,
  type RecognisedSectionKey,
} from "@research-notebook/format";
import { assertNever } from "../../../../shared/assertNever";

/** In-memory search over what the project already has loaded (FR-SRC-01,
 * FR-SRC-02): titles, section text, artefact display names and filenames.
 * Source titles and authors are left out, since citations do not exist yet
 * (Stage 5). Nothing here reads or writes a file; the caller supplies the
 * already-parsed state and, for artefacts, whatever `artefacts.yaml` files
 * it has read so far (`useAllArtefacts`). */

const TOKEN = /[\p{L}\p{N}]+/gu;
/** Raw characters kept either side of a match before the snippet is turned into plain text. */
const SNIPPET_RADIUS = 80;
const SNIPPET_MAX = 200;

function tokenize(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((match) => match[0].toLocaleLowerCase());
}

type FieldTemplate =
  | { kind: "title" }
  | { kind: "motivation" }
  | { kind: "section"; section: RecognisedSectionKey }
  | { kind: "artefactName" }
  | { kind: "artefactFilename" };

interface Entry {
  groupKey: string;
  groupKind: "question" | "experiment";
  groupRef: string;
  groupTitle: string;
  text: string;
  tokens: readonly string[];
  field: FieldTemplate;
}

/** Built once (`buildSearchIndex`) and searched many times as the person types. */
export type SearchIndex = readonly Entry[];

export type SearchHit =
  | { kind: "title"; text: string }
  | { kind: "motivation"; snippet: string }
  | { kind: "section"; section: RecognisedSectionKey; snippet: string }
  | { kind: "artefactName"; text: string }
  | { kind: "artefactFilename"; text: string };

export interface SearchResultGroup {
  /** `question:<fileName>` or `experiment:<folder>`, the same shape `NotebookView` already uses to select a row. */
  key: string;
  kind: "question" | "experiment";
  ref: string;
  title: string;
  hits: SearchHit[];
}

function makeEntry(
  groupKey: string,
  groupKind: "question" | "experiment",
  groupRef: string,
  groupTitle: string,
  text: string,
  field: FieldTemplate,
): Entry | null {
  if (text.trim() === "") return null;
  return {
    groupKey,
    groupKind,
    groupRef,
    groupTitle,
    text,
    tokens: tokenize(text),
    field,
  };
}

function filename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function questionEntries(question: LoadedQuestion): Entry[] {
  const key = `question:${question.fileName}`;
  const { ref, title } = question.file.frontmatter;
  const entries = [
    makeEntry(key, "question", ref, title, title, { kind: "title" }),
    makeEntry(key, "question", ref, title, question.file.body, {
      kind: "motivation",
    }),
  ];
  return entries.filter((entry): entry is Entry => entry !== null);
}

function experimentEntries(
  experiment: LoadedExperiment,
  artefacts: ArtefactsFileModel | undefined,
): Entry[] {
  const key = `experiment:${experiment.folder}`;
  const { ref, title } = experiment.file.frontmatter;
  const entries: (Entry | null)[] = [
    makeEntry(key, "experiment", ref, title, title, { kind: "title" }),
  ];
  for (const section of experiment.file.body.sections) {
    if (section.key === "unknown") continue;
    entries.push(
      makeEntry(key, "experiment", ref, title, section.body, {
        kind: "section",
        section: section.key,
      }),
    );
  }
  for (const artefact of artefacts?.artefacts ?? []) {
    entries.push(
      makeEntry(key, "experiment", ref, title, artefact.name, {
        kind: "artefactName",
      }),
    );
    entries.push(
      makeEntry(key, "experiment", ref, title, filename(artefact.source.path), {
        kind: "artefactFilename",
      }),
    );
  }
  return entries.filter((entry): entry is Entry => entry !== null);
}

/**
 * Every question's title and Motivation, every experiment's title and
 * recognised section text, and every supplied artefact's display name and
 * filename, tokenised once (FR-SRC-01). `artefactsByFolder` need not hold
 * every experiment: one that is missing just searches without its artefacts,
 * the same as any other search with nothing to show yet.
 */
export function buildSearchIndex(
  arranged: Arranged,
  artefactsByFolder: ReadonlyMap<string, ArtefactsFileModel>,
): SearchIndex {
  const entries: Entry[] = [];
  for (const group of arranged.questions) {
    entries.push(...questionEntries(group.question));
    for (const item of group.experiments) {
      entries.push(
        ...experimentEntries(
          item.experiment,
          artefactsByFolder.get(item.experiment.folder),
        ),
      );
    }
  }
  for (const item of arranged.unassigned) {
    entries.push(
      ...experimentEntries(
        item.experiment,
        artefactsByFolder.get(item.experiment.folder),
      ),
    );
  }
  return entries;
}

function matches(entry: Entry, query: readonly string[]): boolean {
  return query.every((word) =>
    entry.tokens.some((token) => token.startsWith(word)),
  );
}

function firstMatchIndex(text: string, word: string): number {
  for (const match of text.matchAll(TOKEN)) {
    if (match[0].toLocaleLowerCase().startsWith(word)) return match.index ?? 0;
  }
  return 0;
}

/** Plain text around the first matching word, markup stripped (`summariseMarkdown`,
 * the same conversion the table's cells use), so a long section still shows
 * where the match is rather than only its start. */
function snippetAround(text: string, query: readonly string[]): string {
  const first = query[0];
  const at = first === undefined ? 0 : firstMatchIndex(text, first);
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(text.length, at + SNIPPET_RADIUS);
  const clean = summariseMarkdown(text.slice(start, end), SNIPPET_MAX);
  return start > 0 ? `…${clean}` : clean;
}

function toHit(entry: Entry, query: readonly string[]): SearchHit {
  switch (entry.field.kind) {
    case "title":
      return { kind: "title", text: entry.text };
    case "artefactName":
      return { kind: "artefactName", text: entry.text };
    case "artefactFilename":
      return { kind: "artefactFilename", text: entry.text };
    case "motivation":
      return { kind: "motivation", snippet: snippetAround(entry.text, query) };
    case "section":
      return {
        kind: "section",
        section: entry.field.section,
        snippet: snippetAround(entry.text, query),
      };
    default:
      return assertNever(entry.field);
  }
}

/**
 * Every entry matching every word of `query` (case-insensitive, each word a
 * prefix match, in any order), grouped by the question or experiment it
 * belongs to (FR-SRC-02). An empty or whitespace-only query matches nothing.
 */
export function searchNotebook(
  index: SearchIndex,
  query: string,
): SearchResultGroup[] {
  const words = tokenize(query);
  if (words.length === 0) return [];
  const groups = new Map<string, SearchResultGroup>();
  for (const entry of index) {
    if (!matches(entry, words)) continue;
    let group = groups.get(entry.groupKey);
    if (group === undefined) {
      group = {
        key: entry.groupKey,
        kind: entry.groupKind,
        ref: entry.groupRef,
        title: entry.groupTitle,
        hits: [],
      };
      groups.set(entry.groupKey, group);
    }
    group.hits.push(toHit(entry, words));
  }
  return [...groups.values()].sort((a, b) =>
    a.ref.localeCompare(b.ref, undefined, { numeric: true }),
  );
}
