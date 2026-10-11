import { describe, expect, it } from "vitest";
import { machineSample } from "../../test/machine-export-sample";
import { selectExported } from "./htmlExport";
import { exportCitationClusters, sectionCitations } from "./exportSections";

function sample() {
  const arranged = machineSample("One", "First [@z:u:7XK2PQ9M].");
  const item = arranged.questions[0]?.experiments[0];
  if (item === undefined) throw new Error("fixture");
  item.experiment.file.body.sections = [
    { key: "methods", body: "Method [@z:u:AAAA2222]." },
    { key: "results_notes", body: "Result [@z:u:BBBB2222]." },
    { key: "interpretation", body: "Reading [@z:u:CCCC2222]." },
  ];
  return arranged;
}

const keys = (clusters: ReturnType<typeof exportCitationClusters>) =>
  clusters.flatMap((c) => c.items.map((i) => i.citekey));

describe("exportCitationClusters (issue #102)", () => {
  it("covers every section the exports show, Results notes included, in output order", () => {
    expect(keys(exportCitationClusters(selectExported(sample())))).toEqual([
      "z:u:AAAA2222",
      "z:u:BBBB2222",
      "z:u:CCCC2222",
    ]);
  });
});

describe("sectionCitations (issue #102)", () => {
  it("gives each section the texts of its own citations, whichever order it is drawn in", () => {
    const shown = selectExported(sample());
    const cursors = sectionCitations(shown, ["[1]", "[2]", "[3]"]);
    const experiment = shown.experiments[0];
    if (experiment === undefined) throw new Error("fixture");
    const ref = experiment.experiment.file.frontmatter.ref;

    // Drawn out of order on purpose: the HTML pages and the PDF differ.
    expect(cursors(`experiment:${ref}:section:2`).next()).toBe("[3]");
    expect(cursors(`experiment:${ref}:section:0`).next()).toBe("[1]");
    expect(cursors(`experiment:${ref}:section:1`).next()).toBe("[2]");
  });

  it("gives an unknown section nothing to draw", () => {
    const cursors = sectionCitations(selectExported(sample()), ["[1]"]);
    expect(cursors("nowhere").next()).toBeNull();
  });
});
