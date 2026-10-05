import {
  parseManifest,
  unlistedFiles,
  type Arranged,
  type Result,
} from "@research-notebook/format";
import type { commands } from "../../../ipc/bindings";

/** The two read-only commands Verify is made through. */
export type VerifyApi = Pick<
  typeof commands,
  "readManifest" | "verifyManifestFiles"
>;

/** A listed file that is not as the manifest recorded it. */
export type VerifyFinding =
  | { kind: "missing" | "unreadable"; path: string }
  | { kind: "changed"; path: string; sizeChanged: boolean };

export type VerifyOutcome = {
  /** Files the manifest lists. */
  checked: number;
  findings: readonly VerifyFinding[];
  /** Captured files the notebook records that the manifest does not list. */
  unlisted: readonly string[];
};

/** Why nothing could be verified. None of these means the files are fine. */
export type VerifyFailure =
  "noManifest" | "manifestUnreadable" | "manifestMalformed" | "filesNotChecked";

/**
 * Verify (FR-ARC-03): re-hashes every file the manifest lists and reports each
 * that is missing, unreadable or changed, and each captured file the manifest
 * does not cover. Reads only. If the manifest cannot be read, or the files
 * cannot be asked about, it says so rather than reporting a clean result.
 */
export async function verifyManifest(input: {
  api: VerifyApi;
  folder: number;
  arranged: Arranged;
}): Promise<Result<VerifyOutcome, VerifyFailure>> {
  const { api, folder, arranged } = input;
  const read = await api.readManifest(folder).catch(() => null);
  if (read === null || read.status !== "ok") {
    return { ok: false, error: "manifestUnreadable" };
  }
  if (read.data.kind === "missing") return { ok: false, error: "noManifest" };
  if (read.data.kind === "unreadable") {
    return { ok: false, error: "manifestUnreadable" };
  }
  const parsed = parseManifest(read.data.text);
  if (!parsed.ok) return { ok: false, error: "manifestMalformed" };

  const entries = parsed.value;
  const asked =
    entries.length === 0
      ? { status: "ok" as const, data: [] }
      : await api.verifyManifestFiles(folder, entries).catch(() => null);
  if (
    asked === null ||
    asked.status !== "ok" ||
    asked.data.length !== entries.length
  ) {
    return { ok: false, error: "filesNotChecked" };
  }

  const findings: VerifyFinding[] = [];
  entries.forEach((entry, index) => {
    const verdict = asked.data[index];
    if (verdict === undefined || verdict.kind === "matches") return;
    if (verdict.kind === "differs") {
      findings.push({
        kind: "changed",
        path: entry.path,
        sizeChanged: verdict.sizeChanged,
      });
    } else {
      findings.push({ kind: verdict.kind, path: entry.path });
    }
  });
  return {
    ok: true,
    value: {
      checked: entries.length,
      findings,
      unlisted: unlistedFiles(arranged, entries),
    },
  };
}
