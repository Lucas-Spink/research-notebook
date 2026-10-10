import type { Arranged } from "./arrange";
import { experimentsOf } from "./manifest";

/** Where the bundle lists the files it does not hold. */
export const LINKED_FILES_ENTRY = "LINKED_FILES.txt";

/**
 * The text of `LINKED_FILES.txt` for a full archive (FR-ARC-08), or `null` when
 * no artefact is linked. Linked files are recorded in place, outside the
 * project, so the archive cannot hold them; this lists them so a reader knows
 * what is missing and where it was. One line per artefact: experiment ref,
 * display name, root and the path below it, tab-separated. The root is
 * `project` or an external root's identifier, never a folder of this machine.
 * Names are single-line by the schema, so a line is one file. Sorted so the
 * same project gives the same bytes.
 */
export function linkedFilesList(arranged: Arranged): string | null {
  const lines: string[] = [];
  for (const item of experimentsOf(arranged)) {
    if (item.artefacts?.kind !== "file") continue;
    const ref = item.experiment.file.frontmatter.ref;
    for (const artefact of item.artefacts.file.artefacts) {
      if (artefact.mode !== "link") continue;
      lines.push(
        [ref, artefact.name, artefact.source.root, artefact.source.path].join(
          "\t",
        ),
      );
    }
  }
  if (lines.length === 0) return null;
  const header = [
    "Files recorded in place and not stored in this archive.",
    "Columns: experiment, name, root, path.",
    "",
  ];
  return `${[...header, ...lines.sort()].join("\n")}\n`;
}
