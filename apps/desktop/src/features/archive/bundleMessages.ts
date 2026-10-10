import type { BundleChoice, BundleResult } from "../../ipc/bindings";
import type { BundleFailure } from "./model/bundle";
import { describeSize } from "./messages";

/** Text of the notebook bundle and full archive (FR-ARC-08, ADR-0057). British English. */
export const bundleMessages = {
  heading: "Bundles",
  intro:
    "A bundle is one .nbk file (a ZIP64 archive) that you save outside the project. A notebook bundle holds only the notebook: your questions, experiments, captured files and exports. A full archive holds the whole project folder, including your analysis files. Your project is only read, never changed. Files that are already compressed, such as images and PDFs, are stored as they are.",
  checking: "Counting the files…",
  linkedNote:
    "Linked files stay where they are and are not in the archive. They are listed in LINKED_FILES.txt inside it.",
  fat32Warning:
    "These files add up to 4 GB or more. A drive formatted as FAT32 cannot hold a file that large; choose a drive formatted as NTFS, exFAT or APFS, or save the notebook bundle instead.",
  cancelled: "No bundle was saved.",
  saving: "Saving…",
  choices: {
    notebook: {
      heading: "Notebook bundle",
      description: "The notebook folder only.",
      save: "Save notebook bundle…",
    },
    archive: {
      heading: "Full archive",
      description: "The whole project folder.",
      save: "Save full archive…",
    },
  } satisfies Record<
    BundleChoice,
    { heading: string; description: string; save: string }
  >,
  failures: {
    planFailed:
      "The files could not be counted, so the size is not known. You can still save the bundle.",
    writeFailed:
      "The bundle could not be saved, so none can be relied on. Try again.",
  } satisfies Record<BundleFailure, string>,
} as const;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What a bundle will hold, from the plan. `null` sizes are unknown. */
export function describePlan(plan: {
  files: number | null;
  bytes: number | null;
  skipped: number | null;
}): string {
  const files =
    plan.files === null ? "Some files" : plural(plan.files, "file", "files");
  const size = plan.bytes === null ? "" : `, ${describeSize(plan.bytes)}`;
  const skipped =
    plan.skipped === null || plan.skipped === 0
      ? ""
      : ` ${plural(plan.skipped, "link or unreadable name", "links or unreadable names")} will be left out.`;
  return `${files}${size} before compression.${skipped}`;
}

/** How a finished attempt ended, in words that carry no system text. */
export function describeBundleResult(result: BundleResult): string {
  switch (result.kind) {
    case "written": {
      const size =
        result.bytes === null ? "" : `, ${describeSize(result.bytes)}`;
      return `Saved ${result.name} in ${result.folder}${size}. It was read back and checked.`;
    }
    case "folderInvalid":
      return "That folder cannot be used. Choose another.";
    case "insideProject":
      return "A bundle cannot be saved inside the project it holds. Choose a folder outside it.";
    case "unsafeName":
      return "The project's name cannot be used as a file name. Rename the project and try again.";
    case "tooLargeForDestination":
      return "The drive refused a file this large, which usually means it is formatted as FAT32. Nothing was saved. Choose a drive formatted as NTFS, exFAT or APFS.";
    case "noSpace":
      return "There is not enough space in that folder. Nothing was saved.";
    case "sourceChanged":
      return "A file changed while the bundle was being saved, so nothing was saved. Try again once other programs have finished with the project.";
    case "failed":
      return "The bundle could not be saved, and nothing was kept. Any earlier bundle is as it was.";
  }
}
