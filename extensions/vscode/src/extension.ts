import { dirname } from "node:path";

import * as vscode from "vscode";

import { captureFile, type Capture } from "./capture";
import { listExperiments, type ExperimentChoice } from "./experiments";
import type { KnownProject } from "./known-projects";
import { arrivalNote } from "./notes";
import { readKnownProjects } from "./read-known";
import { projectsHolding } from "./source";
import { registerStrataView } from "./strata-view";

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

/**
 * The project a file goes to: the one it is inside or, through an external
 * root, the one whose external root folder holds it (ADR-0069). Asks only
 * when more than one project would take it.
 */
async function projectFor(file: vscode.Uri): Promise<KnownProject | undefined> {
  const folders = (vscode.workspace.workspaceFolders ?? []).map(
    (folder) => folder.uri.fsPath,
  );
  const { open, recent } = readKnownProjects([
    ...folders,
    dirname(file.fsPath),
  ]);
  const holding = projectsHolding(file.fsPath, [...open, ...recent]);
  if (holding.length === 0) {
    void vscode.window.showErrorMessage(
      "This file is not in a Research Notebook project or in one of its external root folders.",
    );
    return undefined;
  }
  const [only] = holding;
  if (holding.length === 1) return only;
  const picked = await vscode.window.showQuickPick(
    holding.map((project) => ({
      label: project.name,
      description: project.state === "open" ? "open in STRATA" : "",
      detail: project.root,
      project,
    })),
    { placeHolder: "Which project?" },
  );
  return picked?.project;
}

const CAPTURES = {
  "researchNotebook.addAsResult": { role: "result", override: undefined },
  "researchNotebook.addAsMethod": { role: "method", override: undefined },
  "researchNotebook.addAsLink": { role: "result", override: "link" },
} as const satisfies Record<string, Capture>;

async function addFileToExperiment(
  clicked: vscode.Uri | undefined,
  capture: Capture,
): Promise<void> {
  const fileUri = targetFileUri(clicked);
  if (fileUri === undefined) {
    void vscode.window.showErrorMessage("No file selected.");
    return;
  }

  const project = await projectFor(fileUri);
  if (project === undefined) return;

  const experiments = await listExperiments(project.root);
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

  await captureFile(fileUri, project, experiment, capture);

  void vscode.window.showInformationMessage(
    `Added to ${experiment.ref}. ${arrivalNote(project.state)}`,
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
  registerStrataView(context);
  // The original command, kept for the Command Palette: a result, automatic mode.
  register(context, COMMAND_ID, CAPTURES["researchNotebook.addAsResult"]);
}

export function deactivate(): void {
  // Nothing to clean up: the extension holds no state between commands.
}
