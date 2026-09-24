import { describe, expect, it } from "vitest";
import { planPreview, thumbnailSource, versionPath } from "./plan";

const captured = (fileName: string, type = "other" as const) =>
  planPreview({ fileName, type, captured: true });

describe("planPreview (spec 8)", () => {
  it.each([
    ["plot.png", "image"],
    ["photo.JPG", "image"],
    ["scan.jpeg", "image"],
    ["anim.gif", "image"],
    ["pic.webp", "image"],
    ["stack.tif", "image"],
    ["stack.TIFF", "image"],
    ["old.bmp", "image"],
    ["paper.pdf", "pdf"],
    ["figure.svg", "svg"],
    ["counts.csv", "table"],
    ["counts.tsv", "table"],
    ["counts.csv.gz", "table"],
    ["counts.TSV.GZ", "table"],
    ["analysis.R", "text"],
    ["run.py", "text"],
    ["run.sh", "text"],
    ["Snakefile.smk", "text"],
    ["main.nf", "text"],
    ["task.wdl", "text"],
    ["notes.md", "text"],
    ["log.txt", "text"],
    ["config.yaml", "text"],
    ["data.json", "text"],
    ["pyproject.toml", "text"],
    ["run.log", "text"],
    ["explore.ipynb", "notebook"],
    ["report.Rmd", "notebook"],
    ["report.qmd", "notebook"],
    ["report.html", "html"],
    ["report.HTM", "html"],
    ["archive.zip", "other"],
    ["README", "other"],
  ])("%s previews as %s", (fileName, kind) => {
    expect(captured(fileName).kind).toBe(kind);
  });

  it("goes by extension, so a gzip table recorded as `other` is still a table", () => {
    expect(captured("counts.csv.gz", "other").kind).toBe("table");
  });

  it("shows unlisted scripts and text as text, from their recorded type", () => {
    expect(
      planPreview({ fileName: "fit.jl", type: "script", captured: true }),
    ).toEqual({
      kind: "text",
    });
    expect(
      planPreview({ fileName: "fit.jl", type: "other", captured: true }),
    ).toEqual({
      kind: "other",
      reason: "type",
    });
  });

  it("gives an unsupported image format the fallback, not an image preview", () => {
    expect(
      planPreview({ fileName: "photo.heic", type: "image", captured: true }),
    ).toEqual({
      kind: "other",
      reason: "type",
    });
  });

  it("shows details only for linked artefacts, whose files are outside the project", () => {
    expect(
      planPreview({ fileName: "plot.png", type: "image", captured: false }),
    ).toEqual({
      kind: "other",
      reason: "linked",
    });
  });
});

describe("thumbnailSource", () => {
  it("is made in Rust for raster images, by pdf.js for PDF, and an icon otherwise", () => {
    expect(thumbnailSource(captured("a.png"))).toBe("raster");
    expect(thumbnailSource(captured("a.pdf"))).toBe("pdf");
    expect(thumbnailSource(captured("a.svg"))).toBe("svg");
    expect(thumbnailSource(captured("a.csv"))).toBe("icon");
    expect(thumbnailSource(captured("a.html"))).toBe("icon");
  });
});

describe("versionPath", () => {
  it("joins the experiment folder and the version's file under _notebook", () => {
    expect(versionPath("EXP-001", "evidence/plot.png")).toBe(
      "_notebook/experiments/EXP-001/evidence/plot.png",
    );
  });
});
