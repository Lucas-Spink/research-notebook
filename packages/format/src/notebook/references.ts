import type { JSONContent } from "@tiptap/core";
import { ARTEFACT_REF_NODE_NAME, parseSectionMarkdown } from "../editor";
import type { RecognisedSectionKey } from "../experiment-edit";
import type { Arranged, ArrangedExperiment } from "./arrange";

/**
 * Where one artefact is referenced from: an experiment and the recognised
 * section holding the link (spec 5.6, FR-SRC-03). One entry per reference,
 * so an artefact referenced twice in the same section has two entries.
 */
export interface ReferenceLocation {
  experimentFolder: string;
  experimentRef: string;
  experimentTitle: string;
  section: RecognisedSectionKey;
}

/** Every artefact ULID and the locations that reference it (FR-SRC-03), built once
 * from `arranged` and looked up many times as the person opens different
 * artefacts, the same shape `buildSearchIndex` (S4-T08) already uses. */
export type ReferenceIndex = ReadonlyMap<string, readonly ReferenceLocation[]>;

function ulidOf(node: JSONContent): string | null {
  const attrs: Record<string, unknown> | undefined = node.attrs;
  return typeof attrs?.ulid === "string" ? attrs.ulid : null;
}

/** Every artefact-reference node's ULID in `doc`, in document order. Walks the
 * same Tiptap JSON the live editor renders (`sectionReferences.ts`'s
 * `editor.state.doc.descendants`), but from `parseSectionMarkdown`'s output
 * rather than a mounted editor, so a reference inside a code fence or other
 * passthrough block — never reachable by the real parser's inline tokenizer
 * — is correctly left out (AGENTS.md rule 2: no second, regex-based parser). */
function referencedUlids(doc: JSONContent, found: string[] = []): string[] {
  if (doc.type === ARTEFACT_REF_NODE_NAME) {
    const ulid = ulidOf(doc);
    if (ulid !== null) found.push(ulid);
  }
  for (const child of doc.content ?? []) referencedUlids(child, found);
  return found;
}

/** Every reference in one experiment's recognised sections, with the ULID it
 * targets and the location to report for it. */
function experimentReferences(
  item: ArrangedExperiment,
): { ulid: string; location: ReferenceLocation }[] {
  const { experiment } = item;
  const { ref: experimentRef, title: experimentTitle } =
    experiment.file.frontmatter;
  const found: { ulid: string; location: ReferenceLocation }[] = [];
  for (const section of experiment.file.body.sections) {
    if (section.key === "unknown") continue;
    const location: ReferenceLocation = {
      experimentFolder: experiment.folder,
      experimentRef,
      experimentTitle,
      section: section.key,
    };
    for (const ulid of referencedUlids(parseSectionMarkdown(section.body))) {
      found.push({ ulid, location });
    }
  }
  return found;
}

/**
 * Every experiment and section that references each artefact, across the
 * whole project (FR-SRC-03), the way `buildSearchIndex` builds a flat index
 * once from `arranged` rather than reading files again for every query
 * (ADR-0042, continuing ADR-0041's reasoning rather than reopening it:
 * `nb-index`'s unused `refs` table stays unwired).
 */
export function buildReferenceIndex(arranged: Arranged): ReferenceIndex {
  const index = new Map<string, ReferenceLocation[]>();
  const items: ArrangedExperiment[] = [
    ...arranged.questions.flatMap((question) => question.experiments),
    ...arranged.unassigned,
  ];
  for (const item of items) {
    for (const { ulid, location } of experimentReferences(item)) {
      const list = index.get(ulid);
      if (list === undefined) index.set(ulid, [location]);
      else list.push(location);
    }
  }
  return index;
}

/** Where `artefactId` is referenced (FR-SRC-03): every entry `buildReferenceIndex`
 * recorded for it, or an empty list for an artefact with no references. */
export function referencedIn(
  index: ReferenceIndex,
  artefactId: string,
): readonly ReferenceLocation[] {
  return index.get(artefactId) ?? [];
}
