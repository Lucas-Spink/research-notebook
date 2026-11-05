import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";

import { decideCaptureMode, parseProject } from "@research-notebook/format";
import * as vscode from "vscode";

import { computeProvenance } from "./git-provenance";
import { listExperiments, type ExperimentChoice } from "./experiments";
import { findProjectRoot } from "./project";
import { buildInboxRequest } from "./request";
import { newUlid } from "./ulid";
import { getRepositoryFacts } from "./vscode-git";
import { writeInboxRequest } from "./write-request";

const COMMAND_ID = "researchNotebook.addFileToExperiment";

function targetFileUri(
  clicked: vscode.Uri | undefined,
): vscode.Uri | undefined {
  return clicked ?? vscode.window.activeTextEditor?.document.uri;
}

interface ExperimentPick extends vscode.QuickPickItem {
  experiment: ExperimentChoice;
}

async function pickExperiment(
  experiments: ExperimentChoice[],
): Promise<ExperimentChoice | undefined> {
  const items: ExperimentPick[] = experiments.map((experiment) => ({
    label: `${experiment.ref}: ${experiment.title}`,
    description: `${experiment.questionRef} ${experiment.questionTitle}`,
    experiment,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select an experiment",
    matchOnDescription: true,
  });
  return picked?.experiment;
}

/** What a right-click entry asks for; mode is automatic unless it says otherwise (FR-VSC-04). */
interface Capture {
  role: "result" | "method";
  override: "copy" | "link" | undefined;
}

const CAPTURES = {
  "researchNotebook.addAsResult": { role: "result", override: undefined },
  "researchNotebook.addAsMethod": { role: "method", override: undefined },
  "researchNotebook.addAsLink": { role: "result", override: "link" },
} as const satisfies Record<string, Capture>;

async function addFileToExperiment(
  clicked: vscode.Uri | undefined,
  { role, override }: Capture,
): Promise<void> {
  const fileUri = targetFileUri(clicked);
  if (fileUri === undefined) {
    void vscode.window.showErrorMessage("No file selected.");
    return;
  }

  const projectRoot = findProjectRoot(dirname(fileUri.fsPath), existsSync);
  if (projectRoot === undefined) {
    void vscode.window.showErrorMessage(
      "This file is not inside a Research Notebook project (no _notebook/project.yaml found above it).",
    );
    return;
  }

  const experiments = await listExperiments(projectRoot);
  if (experiments.length === 0) {
    void vscode.window.showErrorMessage(
      "This project has no experiments to add a file to yet.",
    );
    return;
  }
  // Nothing to choose between when the project has a single experiment.
  const experiment =
    experiments.length === 1
      ? experiments[0]
      : await pickExperiment(experiments);
  if (experiment === undefined) return;

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

  void vscode.window.showInformationMessage(
    `Added to ${experiment.ref}. It imports within a couple of seconds if the project is open in Research Notebook, otherwise next time it is opened.`,
  );
}

function register(
  context: vscode.ExtensionContext,
  commandId: string,
  capture: Capture,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      commandId,
      (uri: vscode.Uri | undefined) => {
        void addFileToExperiment(uri, capture).catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          void vscode.window.showErrorMessage(
            `Could not add file to experiment: ${message}`,
          );
        });
      },
    ),
  );
}

export function activate(context: vscode.ExtensionContext): void {
  for (const [commandId, capture] of Object.entries(CAPTURES)) {
    register(context, commandId, capture);
  }
  // The original command, kept for the Command Palette: a result, automatic mode.
  register(context, COMMAND_ID, CAPTURES["researchNotebook.addAsResult"]);
}

export function deactivate(): void {
  // Nothing to clean up: the extension holds no state between commands.
}
