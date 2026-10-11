/**
 * The languages the viewer highlights. A format whose language is `null`
 * still gets the code viewer, with line numbers but no colour.
 */
export type HighlightLanguage = "python" | "r";

/** How a format is shown: as source code, or as a notebook of cells. */
export type ScriptView = "code" | "notebook";

export type ScriptFormat = {
  /** Lower case, without the dot. */
  extension: string;
  view: ScriptView;
  language: HighlightLanguage | null;
};

/**
 * The approved script formats (issue #104). This is the one place a format
 * is added: the preview plan, the viewer's language and the upload
 * validation all read it. Nothing here runs a script; every entry is only
 * ever shown as text.
 */
export const SCRIPT_FORMATS: readonly ScriptFormat[] = [
  { extension: "py", view: "code", language: "python" },
  { extension: "r", view: "code", language: "r" },
  { extension: "ipynb", view: "notebook", language: "python" },
  { extension: "sh", view: "code", language: null },
  { extension: "smk", view: "code", language: null },
  { extension: "nf", view: "code", language: null },
  { extension: "wdl", view: "code", language: null },
  { extension: "jl", view: "code", language: null },
  { extension: "sql", view: "code", language: null },
];

/** The last extension of `fileName`, lower case; empty for none. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot <= 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** The approved format of a file, matched case-insensitively; the name is kept as it is. */
export function scriptFormatOf(fileName: string): ScriptFormat | null {
  const extension = extensionOf(fileName);
  return (
    SCRIPT_FORMATS.find((format) => format.extension === extension) ?? null
  );
}

/** Whether a file is code, a notebook, or not an approved script at all. */
export function scriptKindOf(fileName: string): ScriptView | "unsupported" {
  return scriptFormatOf(fileName)?.view ?? "unsupported";
}

/** The approved extensions with their dot, for messages: ".py, .r and .ipynb". */
export function approvedExtensionsText(): string {
  const dotted = SCRIPT_FORMATS.map((format) => `.${format.extension}`);
  const last = dotted.at(-1);
  return last === undefined || dotted.length === 1
    ? dotted.join("")
    : `${dotted.slice(0, -1).join(", ")} and ${last}`;
}

/** The extensions shown with the code viewer. */
export function codeExtensions(): string[] {
  return SCRIPT_FORMATS.filter((format) => format.view === "code").map(
    (format) => format.extension,
  );
}
