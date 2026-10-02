import { DEFAULT_STYLE_XML, EN_US_LOCALE } from "@research-notebook/citations";
import type { commands, FolderHandle } from "../../../ipc/bindings";

/** The one command a style load uses, so tests can supply a fake with the same shape. */
export type StyleApi = Pick<typeof commands, "readNotebookFile">;

export type LoadedStyle = { styleXml: string; localeXml: string };

const FALLBACK: LoadedStyle = {
  styleXml: DEFAULT_STYLE_XML,
  localeXml: EN_US_LOCALE,
};

/**
 * The citation style the project names (`citation_style`, a file in
 * `styles/`), with the bundled locale. A project whose style file is not
 * there yet gets the bundled numbered style, so Literature still renders
 * (copying the active style into `styles/` is S5-T06's job); a read that
 * fails does the same rather than leaving a save without a block.
 */
export async function loadStyle(
  api: StyleApi,
  folder: FolderHandle,
  styleFile: string | null,
): Promise<LoadedStyle> {
  if (styleFile === null) return FALLBACK;
  try {
    const read = await api.readNotebookFile(
      folder,
      `_notebook/styles/${styleFile}`,
    );
    if (read.status === "error" || read.data.kind !== "text") return FALLBACK;
    return { styleXml: read.data.text, localeXml: EN_US_LOCALE };
  } catch {
    return FALLBACK;
  }
}
