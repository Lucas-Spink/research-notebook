import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

import { decideCaptureMode, parseProject } from "@research-notebook/format";
import * as vscode from "vscode";

import type { ExperimentChoice } from "./experiments";
import { computeProvenance } from "./git-provenance";
import { buildInboxRequest } from "./request";
import { newUlid } from "./ulid";
import { getRepositoryFacts } from "./vscode-git";
import { writeInboxRequest } from "./write-request";

/** What a capture asks for; mode is automatic unless it says otherwise (FR-VSC-04). */
export interface Capture {
  role: "result" | "method";
  override: "copy" | "link" | undefined;
}

/** What the confirmation says, shared by every way of adding a file (FR-VSC-07). */
export const IMPORT_NOTE =
  "It imports within a couple of seconds if the project is open in Research Notebook, otherwise next time it is opened.";

/**
 * Writes one inbox request for `fileUri` into `experiment` of the project at
 * `projectRoot` (FR-VSC-05): the file is hashed, copied or linked by the
 * project's threshold, git provenance recorded through the VS Code Git API,
 * and the request written atomically. Writes nothing else (FR-VSC-06).
 * Throws if the file or the project cannot be read.
 */
export async function captureFile(
  fileUri: vscode.Uri,
  projectRoot: string,
  experiment: ExperimentChoice,
  { role, override }: Capture,
): Promise<void> {
  const projectYamlText = await readFile(
    `${projectRoot}/_notebook/project.yaml`,
    "utf8",
  );
  const project = parseProject(projectYamlText);
  const copyThresholdMb = project.ok
    ? project.value.capture.copy_threshold_mb
    : 0;

  const bytes = await readFile(fileUri.fsPath);
  const fileStat = await stat(fileUri.fsPath);
  const mode = decideCaptureMode(fileStat.size, copyThresholdMb, override);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const facts = getRepositoryFacts(fileUri);
  const provenance =
    facts === undefined
      ? null
      : computeProvenance(fileUri.fsPath, projectRoot, facts);

  const request = buildInboxRequest({
    requestId: newUlid(),
    createdAt: new Date(),
    extensionVersion:
      (
        vscode.extensions.getExtension(
          "research-notebook.research-notebook-vscode",
        )?.packageJSON as { version?: string } | undefined
      )?.version ?? "0.0.0",
    projectRoot,
    filePath: fileUri.fsPath,
    experimentId: experiment.id,
    role,
    mode,
    sha256,
    size: fileStat.size,
    payload: mode === "copy" ? basename(fileUri.fsPath) : null,
    provenance,
  });

  await writeInboxRequest(projectRoot, request, mode === "copy" ? bytes : null);
}
