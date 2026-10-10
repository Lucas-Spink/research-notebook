import {
  LINKED_FILES_ENTRY,
  linkedFilesList,
  type Arranged,
  type Result,
} from "@research-notebook/format";
import type {
  BundleChoice,
  BundleExtraInput,
  BundleResult,
  BundleSummary,
  commands,
} from "../../../ipc/bindings";

/** The two commands bundles are made through. Neither writes inside the project. */
export type BundleApi = Pick<typeof commands, "planBundle" | "writeBundle">;

/** Why no plan or no bundle can be reported. Nothing is claimed in either case. */
export type BundleFailure = "planFailed" | "writeFailed";

/** The longest project name kept in a bundle's file name. */
const LONGEST_NAME = 80;

/**
 * The file name, without extension, a bundle is offered under: the project's
 * name with anything a file name cannot hold made a hyphen, and the kind of
 * bundle after it. Rust checks the result again.
 */
export function bundleStem(projectName: string, choice: BundleChoice): string {
  const base = projectName
    // eslint-disable-next-line no-control-regex -- control characters are what is removed
    .replace(/[\u0000-\u001f<>:"/\\|?*\s]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, LONGEST_NAME)
    .replace(/^[-. ]+|[-. ]+$/g, "");
  return `${base === "" ? "project" : base}-${choice}`;
}

/** Counts what a bundle would hold, so a FAT32 warning can come first. */
export async function planBundle(input: {
  api: BundleApi;
  folder: number;
  choice: BundleChoice;
}): Promise<Result<BundleSummary, BundleFailure>> {
  const { api, folder, choice } = input;
  const answered = await api.planBundle(folder, choice).catch(() => null);
  if (answered === null || answered.status !== "ok") {
    return { ok: false, error: "planFailed" };
  }
  return { ok: true, value: answered.data };
}

/** The entries a full archive carries beside the project's files. */
function extrasFor(
  choice: BundleChoice,
  arranged: Arranged,
): BundleExtraInput[] {
  if (choice !== "archive") return [];
  const text = linkedFilesList(arranged);
  return text === null ? [] : [{ path: LINKED_FILES_ENTRY, text }];
}

/**
 * Asks the person where to save the bundle and writes it there (FR-ARC-08).
 * `null` means they cancelled. A reply that is not an answer is a failure,
 * never a bundle that was probably saved.
 */
export async function writeBundle(input: {
  api: BundleApi;
  folder: number;
  choice: BundleChoice;
  stem: string;
  arranged: Arranged;
}): Promise<Result<BundleResult | null, BundleFailure>> {
  const { api, folder, choice, stem, arranged } = input;
  const answered = await api
    .writeBundle(folder, choice, stem, extrasFor(choice, arranged))
    .catch(() => null);
  if (answered === null || answered.status !== "ok") {
    return { ok: false, error: "writeFailed" };
  }
  return { ok: true, value: answered.data };
}
