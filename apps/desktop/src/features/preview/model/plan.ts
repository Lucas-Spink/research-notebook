import type { ARTEFACT_TYPES } from "@research-notebook/format";
import { assertNever } from "../../../shared/assertNever";
import {
  codeExtensions,
  extensionOf,
  scriptFormatOf,
  type ScriptFormat,
} from "./scriptFormats";

/** An artefact's recorded type (spec 5.8). */
export type ArtefactType = (typeof ARTEFACT_TYPES)[number];

/**
 * How a version's file is previewed (spec 8). `other` shows details only,
 * because the file's type has no preview, or because a linked file lies
 * outside the project and the asset protocol may not reach it (spec 6.7).
 */
export type PreviewPlan =
  | { kind: "image" }
  | { kind: "pdf" }
  | { kind: "svg" }
  | { kind: "table" }
  | { kind: "text"; script?: ScriptFormat }
  | { kind: "notebook"; cells?: true }
  | { kind: "html" }
  | { kind: "other"; reason: "type" | "linked" };

export type PlanInput = {
  /** The version's file name, which decides the preview (spec 8). */
  fileName: string;
  /** The type recorded for the artefact, used when the extension is not listed. */
  type: ArtefactType;
  /** Whether the version is a copy in `_notebook/`; `false` for linked artefacts. */
  captured: boolean;
};

// Spec 8's extension lists, lower case.
const RASTER = ["png", "jpg", "jpeg", "gif", "webp", "tif", "tiff", "bmp"];
// Approved scripts come from the registry, so a new format is listed once.
const TEXT = [
  ...codeExtensions(),
  "md",
  "txt",
  "yaml",
  "yml",
  "json",
  "toml",
  "log",
];
const NOTEBOOK = ["ipynb", "rmd", "qmd"];
const HTML = ["html", "htm"];
const TABLE = /\.(csv|tsv)(\.gz)?$/i;

/** Approved code formats get the script viewer; other text the plain one. */
function textPlan(fileName: string): PreviewPlan {
  const script = scriptFormatOf(fileName);
  return script?.view === "code" ? { kind: "text", script } : { kind: "text" };
}

/**
 * Chooses a version's preview from its file name, as spec 8 lists them. The
 * extension decides rather than the recorded type, because a type inferred
 * from the last extension alone records `counts.csv.gz` as `other`.
 */
export function planPreview({
  fileName,
  type,
  captured,
}: PlanInput): PreviewPlan {
  if (!captured) return { kind: "other", reason: "linked" };
  if (TABLE.test(fileName)) return { kind: "table" };
  const extension = extensionOf(fileName);
  if (RASTER.includes(extension)) return { kind: "image" };
  if (extension === "pdf") return { kind: "pdf" };
  if (extension === "svg") return { kind: "svg" };
  if (NOTEBOOK.includes(extension)) {
    // Only a Jupyter notebook has cells to draw; Rmd and Quarto show details.
    return scriptFormatOf(fileName)?.view === "notebook"
      ? { kind: "notebook", cells: true }
      : { kind: "notebook" };
  }
  if (HTML.includes(extension)) return { kind: "html" };
  if (TEXT.includes(extension)) return textPlan(fileName);
  // Showing the first lines of any script or text is safe: it is bounded.
  if (type === "script" || type === "text") return { kind: "text" };
  return { kind: "other", reason: "type" };
}

/** Where a version's thumbnail comes from (spec 8, "Thumbnail" column). */
export type ThumbnailSource = "raster" | "pdf" | "svg" | "icon";

export function thumbnailSource(plan: PreviewPlan): ThumbnailSource {
  switch (plan.kind) {
    case "image":
      return "raster";
    case "pdf":
      return "pdf";
    case "svg":
      return "svg";
    case "table":
    case "text":
    case "notebook":
    case "html":
    case "other":
      return "icon";
    default:
      return assertNever(plan);
  }
}

/**
 * The project-relative path of a captured version's file: the experiment's
 * folder, then the version's `file`, which lies under `evidence/` or
 * `methods/` (spec 5.8).
 */
export function versionPath(experimentFolder: string, file: string): string {
  return `_notebook/experiments/${experimentFolder}/${file}`;
}
