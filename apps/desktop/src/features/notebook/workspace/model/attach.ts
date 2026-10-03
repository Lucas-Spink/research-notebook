import {
  appendCitation,
  citationClusters,
  citesCitekey,
  removeCitekey,
  type ExperimentBodyModel,
  type RecognisedSectionKey,
} from "@research-notebook/format";

/** Where a newly attached source's citation is written. */
export const ATTACH_SECTION: RecognisedSectionKey = "methods";

/** The sections whose text can hold a citation, in the order the experiment shows them. */
const CITING_SECTIONS: readonly RecognisedSectionKey[] = [
  "methods",
  "results_notes",
  "interpretation",
];

function textOf(body: ExperimentBodyModel, key: RecognisedSectionKey): string {
  return body.sections.find((section) => section.key === key)?.body ?? "";
}

/** What each body cites, kept while the body is: a saved edit makes a new body, so only that one is read again. */
const citedCache = new WeakMap<ExperimentBodyModel, ReadonlySet<string>>();

/** The citekeys an experiment cites in any of its sections, so the Sources pane can show which are attached. */
export function attachedCitekeys(
  body: ExperimentBodyModel,
): ReadonlySet<string> {
  const known = citedCache.get(body);
  if (known !== undefined) return known;
  const cited = new Set(
    CITING_SECTIONS.flatMap((key) =>
      citationClusters(textOf(body, key)).flatMap((cluster) =>
        cluster.items.map((item) => item.citekey),
      ),
    ),
  );
  citedCache.set(body, cited);
  return cited;
}

/** One section's new text. */
export type SectionEdit = { key: RecognisedSectionKey; text: string };

/** The edit that attaches `citekey`: its citation at the end of Methods, or none when it is already cited. */
export function attachEdits(
  body: ExperimentBodyModel,
  citekey: string,
): SectionEdit[] {
  if (attachedCitekeys(body).has(citekey)) return [];
  return [
    {
      key: ATTACH_SECTION,
      text: appendCitation(textOf(body, ATTACH_SECTION), citekey),
    },
  ];
}

/** The edits that detach `citekey`: every section that cites it, with the citation taken out. */
export function detachEdits(
  body: ExperimentBodyModel,
  citekey: string,
): SectionEdit[] {
  return CITING_SECTIONS.flatMap((key) => {
    const text = textOf(body, key);
    return citesCitekey(text, citekey)
      ? [{ key, text: removeCitekey(text, citekey) }]
      : [];
  });
}

/** The edit that attaches the citation the picker composed (with its locators): a paragraph at the end of Methods. */
export function attachMarkdownEdits(
  body: ExperimentBodyModel,
  markdown: string,
): SectionEdit[] {
  const current = textOf(body, ATTACH_SECTION);
  const trimmed = current.replace(/\s+$/, "");
  const tail = current.endsWith("\n") ? "\n" : "";
  const text =
    trimmed === "" ? `${markdown}${tail}` : `${trimmed}\n\n${markdown}${tail}`;
  return [{ key: ATTACH_SECTION, text }];
}
