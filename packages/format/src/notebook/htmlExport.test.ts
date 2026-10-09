import { describe, expect, it } from "vitest";
import {
  IMAGE_V2,
  TABLE_V1,
  exportAssets,
  exportSample,
} from "../../test/html-export-sample";
import { hex64 } from "../../test/samples";
import type { Arranged } from "./arrange";
import {
  htmlAssetRequests,
  renderHtmlExport,
  type ExportAsset,
} from "./htmlExport";

const project = exportSample;
const assets = exportAssets;

function render(arranged = project(), found = assets()) {
  const pages = renderHtmlExport({
    arranged,
    projectName: "Yeast study",
    locale: "en-GB",
    assets: found,
  });
  const byName = new Map(pages.map((p) => [p.name, p.html]));
  const page = (name: string): string => {
    const html = byName.get(name);
    if (html === undefined) throw new Error(`no page ${name}`);
    return html;
  };
  return { pages, page };
}

describe("htmlAssetRequests (FR-ARC-05)", () => {
  it("asks for the latest version of each image and table only", () => {
    const requests = htmlAssetRequests(project());
    expect(requests.map((r) => [r.path, r.kind])).toEqual([
      [IMAGE_V2, "image"],
      [TABLE_V1, "table"],
    ]);
    expect(requests[0]?.sha256).toBe(hex64("a11"));
  });
});

describe("renderHtmlExport (FR-ARC-05)", () => {
  it("makes an index and a page per experiment", () => {
    const { pages, page } = render();
    expect(pages.map((p) => p.name)).toEqual(["index.html", "EXP-001.html"]);
    expect(page("index.html")).toContain("Yeast study");
    expect(page("index.html")).toContain('<a href="EXP-001.html">');
  });

  it("makes a page per question, linking its experiments", () => {
    const arranged = project();
    const [item] = arranged.unassigned;
    if (item === undefined) throw new Error("fixture");
    const questionId = item.experiment.file.frontmatter.question;
    const withQuestion: Arranged = {
      ...arranged,
      unassigned: [],
      questions: [
        {
          readOnly: false,
          experiments: [item],
          question: {
            fileName: "Q-001.md",
            file: {
              frontmatter: {
                id: questionId,
                ref: "Q-001",
                title: "Why does it grow?",
                created: "2026-09-01T10:00:00Z",
              },
              body: "Because **yeast**.",
            },
          },
        },
      ],
    };
    const { pages, page } = render(withQuestion);
    expect(pages.map((p) => p.name)).toEqual([
      "index.html",
      "Q-001.html",
      "EXP-001.html",
    ]);
    expect(page("Q-001.html")).toContain("Why does it grow?");
    expect(page("Q-001.html")).toContain("<strong>yeast</strong>");
    expect(page("Q-001.html")).toContain('href="EXP-001.html"');
    expect(page("EXP-001.html")).toContain('href="Q-001.html"');
  });

  it("escapes every title, name and note", () => {
    const { pages } = render(
      project("<script>alert(1)</script>", "<img src=x onerror=alert(1)>"),
    );
    for (const { html } of pages) {
      expect(html).not.toContain("<script>alert");
      expect(html).not.toContain("<img src=x");
    }
  });

  it("downscales figures and links to the original beside them", () => {
    const html = render().page("EXP-001.html");
    expect(html).toContain(
      '<a href="../../experiments/EXP-001/evidence/volcano.v2.png"><img src="assets/abc-800.png" width="800" height="600" alt="Volcano plot"></a>',
    );
  });

  it("shows a sampled table, escaped, with a note that rows are left out", () => {
    const html = render().page("EXP-001.html");
    expect(html).toContain("<th>gene</th>");
    expect(html).toContain("<td>A&lt;1&gt;</td>");
    expect(html).toContain('class="more"');
    expect(html).toContain(
      'href="../../experiments/EXP-001/evidence/counts.csv"',
    );
  });

  it("lists every version of an artefact with a link to each file", () => {
    const html = render().page("EXP-001.html");
    expect(html).toContain(
      'href="../../experiments/EXP-001/evidence/pca_by_treatment.pdf"',
    );
    expect(html).toContain(
      'href="../../experiments/EXP-001/evidence/pca_by_treatment.v2.pdf"',
    );
  });

  it("shows a vector figure from its original, as an image only", () => {
    const html = render().page("EXP-001.html");
    expect(html).toContain(
      '<img src="../../experiments/EXP-001/evidence/diagram.svg"',
    );
  });

  it("links a linked project file from the project folder and only names an external one", () => {
    const html = render().page("EXP-001.html");
    expect(html).toContain('href="../../../data/counts.h5"');

    const external = project();
    const item = external.unassigned[0];
    if (item?.artefacts?.kind !== "file") throw new Error("fixture");
    const raw = item.artefacts.file.artefacts.find((a) => a.mode === "link");
    if (raw === undefined) throw new Error("fixture");
    raw.source = { root: "01JAXR7R7R7R7R7R7R7R7R7R7R", path: "data/counts.h5" };
    const text = render(external).page("EXP-001.html");
    expect(text).not.toContain('href="../../../data/counts.h5"');
    expect(text).toContain("data/counts.h5");
  });

  it("says when a figure or table could not be prepared, and still links the file", () => {
    const html = render(
      project(),
      new Map<string, ExportAsset>([
        [IMAGE_V2, { kind: "unavailable" }],
        [TABLE_V1, { kind: "none" }],
      ]),
    ).page("EXP-001.html");
    expect(html).toContain("Preview not available");
    expect(html).toContain("volcano.v2.png");
    expect(html).not.toContain('<img src="assets/');
  });

  it("says when an experiment's artefacts could not be read", () => {
    const arranged = project();
    const item = arranged.unassigned[0];
    if (item === undefined) throw new Error("fixture");
    item.artefacts = { kind: "unreadable" };
    expect(render(arranged).page("EXP-001.html")).toContain(
      "Artefacts could not be read",
    );
  });

  it("uses no scripts, remote resources or inline event handlers", () => {
    const { pages } = render();
    for (const { html } of pages) {
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/\son[a-z]+=/i);
      expect(html).not.toMatch(/(src|href)="https?:/i);
      expect(html).toContain('lang="en-GB"');
    }
  });

  it("is the same on every run", () => {
    expect(render().pages).toEqual(render().pages);
  });
});
