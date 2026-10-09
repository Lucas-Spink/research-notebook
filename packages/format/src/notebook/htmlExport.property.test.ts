import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arrangedFrom, loadedExperiment } from "../../test/notebook-support";
import { artefactsSample } from "../../test/samples";
import { ArtefactsFile } from "../schema";
import { renderHtmlExport } from "./htmlExport";
import { escapeHtml } from "./htmlMarkdown";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

const noControls = (text: string): boolean =>
  [...text].every((c) => {
    const code = c.charCodeAt(0);
    return code >= 0x20 && !(code >= 0x7f && code <= 0x9f);
  });

/** Wording that tries to open a tag, close an attribute or start a script. */
const hostile = fc
  .oneof(
    fc.constantFrom(
      "<script>alert(1)</script>",
      '"><img src=x onerror=alert(1)>',
      "'><svg/onload=alert(1)>",
      "</title><script>",
    ),
    fc.string({ minLength: 1, maxLength: 20 }),
  )
  .filter((text) => text.trim() !== "" && noControls(text));

function pagesFor(title: string, note: string, name: string): string[] {
  const artefacts = ArtefactsFile.parse(structuredClone(artefactsSample));
  const first = artefacts.artefacts[1];
  if (first === undefined) throw new Error("fixture");
  first.name = name;
  const arranged = arrangedFrom([
    loadedExperiment("EXP-001", "EXP-001", "Q1", { methods: note }),
  ]);
  const [item] = arranged.unassigned;
  if (item === undefined) throw new Error("fixture");
  item.experiment.file.frontmatter.title = title;
  item.artefacts = { kind: "file", file: artefacts };
  return renderHtmlExport({
    arranged,
    projectName: title,
    locale: "en-GB",
    assets: new Map(),
  }).map((page) => page.html);
}

describe("renderHtmlExport escaping (FR-ARC-05)", () => {
  it("never lets a title, note or artefact name become markup", () => {
    fc.assert(
      fc.property(hostile, hostile, hostile, (title, note, name) => {
        for (const html of pagesFor(title, note, name)) {
          expect(html).not.toMatch(/<script/i);
          expect(html).not.toMatch(/<img[^>]*onerror/i);
          expect(html).not.toMatch(/<svg/i);
          expect(html.match(/<title>/g)).toHaveLength(1);
        }
        const experiment = pagesFor(title, note, name)[1] ?? "";
        expect(experiment).toContain(escapeHtml(title));
        expect(experiment).toContain(escapeHtml(name));
      }),
      { numRuns },
    );
  });
});
