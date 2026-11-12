import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

import * as vscode from "vscode";

import { captureFile, IMPORT_NOTE, type Capture } from "./capture";
import { filesFromUriList } from "./drop";
import { listExperiments, type ExperimentChoice } from "./experiments";
import {
  groupByQuestion,
  isInsideProject,
  projectRootsOf,
  type QuestionGroup,
} from "./project-tree";

export const VIEW_ID = "researchNotebook.projectView";
export const CHOOSE_MODE_COMMAND = "researchNotebook.chooseDropMode";
export const REFRESH_COMMAND = "researchNotebook.refreshView";

/** The Explorer's drop payload: the dragged files as `toString()`ed URIs. */
const URI_LIST = "text/uri-list";
const MODE_KEY = "researchNotebook.dropMode";

type DropMode = "result" | "method" | "link";

/** What each drop mode adds (FR-VSC-04): result and method copy or link by the project's threshold; link never copies. */
const MODES: Record<DropMode, { label: string; capture: Capture }> = {
  result: {
    label: "Result",
    capture: { role: "result", override: undefined },
  },
  method: {
    label: "Method",
    capture: { role: "method", override: undefined },
  },
  link: {
    label: "Link (no copy)",
    capture: { role: "result", override: "link" },
  },
};

type Node =
  | { kind: "project"; root: string }
  | { kind: "question"; root: string; group: QuestionGroup }
  | { kind: "experiment"; root: string; experiment: ExperimentChoice };

/**
 * The STRATA view in the Explorer: each project in the workspace, its
 * questions and their experiments, where files dragged from the Explorer are
 * dropped onto an experiment to add them (the same inbox request the
 * right-click commands write). It only ever reads the project and writes
 * inbox requests (FR-VSC-06).
 */
class StrataView
  implements
    vscode.TreeDataProvider<Node>,
    vscode.TreeDragAndDropController<Node>
{
  readonly dropMimeTypes = [URI_LIST];
  readonly dragMimeTypes: readonly string[] = [];

  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly state: vscode.Memento) {}

  refresh(): void {
    this.changed.fire(undefined);
  }

  get mode(): DropMode {
    const saved = this.state.get<string>(MODE_KEY);
    return saved === "method" || saved === "link" ? saved : "result";
  }

  async setMode(mode: DropMode): Promise<void> {
    await this.state.update(MODE_KEY, mode);
    this.refresh();
  }

  private projectRoots(): string[] {
    const folders = (vscode.workspace.workspaceFolders ?? []).map(
      (folder) => folder.uri.fsPath,
    );
    return projectRootsOf(folders, existsSync);
  }

  private async questionNodes(root: string): Promise<Node[]> {
    const groups = groupByQuestion(await listExperiments(root));
    return groups.map((group) => ({ kind: "question", root, group }));
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node === undefined) {
      const roots = this.projectRoots();
      const [only] = roots;
      // A single project needs no heading of its own.
      if (roots.length === 1 && only !== undefined) {
        return this.questionNodes(only);
      }
      return roots.map((root) => ({ kind: "project", root }));
    }
    if (node.kind === "project") return this.questionNodes(node.root);
    if (node.kind === "question") {
      return node.group.experiments.map((experiment) => ({
        kind: "experiment",
        root: node.root,
        experiment,
      }));
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "project": {
        const item = new vscode.TreeItem(
          basename(node.root),
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.contextValue = "project";
        item.iconPath = new vscode.ThemeIcon("notebook");
        return item;
      }
      case "question": {
        const item = new vscode.TreeItem(
          `${node.group.questionRef} ${node.group.questionTitle}`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.contextValue = "question";
        item.iconPath = new vscode.ThemeIcon("question");
        return item;
      }
      case "experiment": {
        const { experiment } = node;
        const item = new vscode.TreeItem(
          `${experiment.ref}: ${experiment.title}`,
          vscode.TreeItemCollapsibleState.None,
        );
        item.contextValue = "experiment";
        item.iconPath = new vscode.ThemeIcon("beaker");
        item.tooltip = `Drop files here to add them as ${MODES[this.mode].label.toLowerCase()}`;
        return item;
      }
    }
  }

  async handleDrop(
    target: Node | undefined,
    dataTransfer: vscode.DataTransfer,
  ): Promise<void> {
    if (target?.kind !== "experiment") {
      void vscode.window.showInformationMessage(
        "Drop files onto an experiment.",
      );
      return;
    }
    const payload = dataTransfer.get(URI_LIST);
    if (payload === undefined) return;
    const paths = filesFromUriList(await payload.asString());
    await this.addFiles(target.root, target.experiment, paths);
  }

  private async addFiles(
    root: string,
    experiment: ExperimentChoice,
    paths: readonly string[],
  ): Promise<void> {
    const capture = MODES[this.mode].capture;
    let added = 0;
    const problems: string[] = [];
    for (const path of paths) {
      const name = basename(path);
      if (!isInsideProject(root, path)) {
        problems.push(`${name} is outside the project`);
        continue;
      }
      try {
        if (!(await stat(path)).isFile()) {
          problems.push(`${name} is a folder`);
          continue;
        }
        await captureFile(vscode.Uri.file(path), root, experiment, capture);
        added += 1;
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        problems.push(`${name}: ${why}`);
      }
    }
    if (added > 0) {
      const files = added === 1 ? "1 file" : `${added} files`;
      void vscode.window.showInformationMessage(
        `Added ${files} to ${experiment.ref}. ${IMPORT_NOTE}`,
      );
    }
    if (problems.length > 0) {
      void vscode.window.showWarningMessage(
        `Not added: ${problems.join("; ")}.`,
      );
    }
    if (added === 0 && problems.length === 0) {
      void vscode.window.showInformationMessage(
        "Nothing to add: drag files from the Explorer.",
      );
    }
  }
}

/** Registers the view, its commands and the watcher that keeps it current. */
export function registerStrataView(context: vscode.ExtensionContext): void {
  const view = new StrataView(context.workspaceState);
  const tree = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: view,
    dragAndDropController: view,
    showCollapseAll: true,
  });
  const describeMode = () => {
    tree.description = `drops add as ${MODES[view.mode].label.toLowerCase()}`;
  };
  describeMode();

  // Questions and experiments change in the desktop app; the view follows.
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/_notebook/{questions/*.md,experiments/*/experiment.md}",
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refreshSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => view.refresh(), 300);
  };
  watcher.onDidCreate(refreshSoon);
  watcher.onDidChange(refreshSoon);
  watcher.onDidDelete(refreshSoon);

  context.subscriptions.push(
    tree,
    watcher,
    { dispose: () => clearTimeout(timer) },
    vscode.workspace.onDidChangeWorkspaceFolders(() => view.refresh()),
    vscode.commands.registerCommand(REFRESH_COMMAND, () => view.refresh()),
    vscode.commands.registerCommand(CHOOSE_MODE_COMMAND, async () => {
      const items: (vscode.QuickPickItem & { mode: DropMode })[] = (
        Object.keys(MODES) as DropMode[]
      ).map((mode) => ({
        label: MODES[mode].label,
        ...(mode === view.mode ? { description: "current" } : {}),
        mode,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "What should dropped files be added as?",
      });
      if (picked === undefined) return;
      await view.setMode(picked.mode);
      describeMode();
    }),
  );
}
