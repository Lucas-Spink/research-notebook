import { stat } from "node:fs/promises";
import { basename } from "node:path";

import * as vscode from "vscode";

import { captureFile, type Capture } from "./capture";
import { filesFromUriList } from "./drop";
import { listExperiments, type ExperimentChoice } from "./experiments";
import type { KnownProject } from "./known-projects";
import {
  groupByQuestion,
  isInsideProject,
  type QuestionGroup,
} from "./project-tree";
import { arrivalNote } from "./notes";
import { readKnownProjects } from "./read-known";

export const VIEW_ID = "researchNotebook.projectView";
export const CHOOSE_MODE_COMMAND = "researchNotebook.chooseDropMode";
export const REFRESH_COMMAND = "researchNotebook.refreshView";

/** The Explorer's drop payload: the dragged files as `toString()`ed URIs. */
const URI_LIST = "text/uri-list";
const MODE_KEY = "researchNotebook.dropMode";

/** How often the view looks at the app's settings and locks while it is visible (ADR-0069). */
const FOLLOW_MS = 3000;

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
  | { kind: "group"; group: "open" | "recent"; projects: KnownProject[] }
  | { kind: "project"; project: KnownProject }
  | { kind: "question"; project: KnownProject; group: QuestionGroup }
  | { kind: "experiment"; project: KnownProject; experiment: ExperimentChoice };

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

  /** The projects now: the workspace's and the app's (ADR-0069). */
  projects(): { open: KnownProject[]; recent: KnownProject[] } {
    const folders = (vscode.workspace.workspaceFolders ?? []).map(
      (folder) => folder.uri.fsPath,
    );
    return readKnownProjects(folders);
  }

  private async questionNodes(project: KnownProject): Promise<Node[]> {
    const groups = groupByQuestion(await listExperiments(project.root));
    return groups.map((group) => ({ kind: "question", project, group }));
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node === undefined) {
      const { open, recent } = this.projects();
      const [only] = [...open, ...recent];
      // A single project needs no heading of its own.
      if (open.length + recent.length === 1 && only !== undefined) {
        return this.questionNodes(only);
      }
      const groups: Node[] = [];
      if (open.length > 0) {
        groups.push({ kind: "group", group: "open", projects: open });
      }
      if (recent.length > 0) {
        groups.push({ kind: "group", group: "recent", projects: recent });
      }
      return groups;
    }
    if (node.kind === "group") {
      return node.projects.map((project) => ({ kind: "project", project }));
    }
    if (node.kind === "project") return this.questionNodes(node.project);
    if (node.kind === "question") {
      return node.group.experiments.map((experiment) => ({
        kind: "experiment",
        project: node.project,
        experiment,
      }));
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "group": {
        const open = node.group === "open";
        const item = new vscode.TreeItem(
          open ? "Open in STRATA" : "Recent",
          open
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.contextValue = "group";
        item.iconPath = new vscode.ThemeIcon(
          open ? "circle-filled" : "history",
        );
        return item;
      }
      case "project": {
        const { project } = node;
        const item = new vscode.TreeItem(
          project.name,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.contextValue = "project";
        item.iconPath = new vscode.ThemeIcon("notebook");
        item.description =
          project.state === "open" ? "open in STRATA" : "not open";
        item.tooltip = project.root;
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
    await this.addFiles(target.project, target.experiment, paths);
  }

  private async addFiles(
    project: KnownProject,
    experiment: ExperimentChoice,
    paths: readonly string[],
  ): Promise<void> {
    const root = project.root;
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
        `Added ${files} to ${experiment.ref}. ${arrivalNote(project.state)}`,
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
  // The app's open projects change outside the workspace, where no watcher
  // reaches, so look every few seconds while the view is on screen and
  // redraw only when what it would show has changed (ADR-0069).
  let shown = JSON.stringify(view.projects());
  const follow = () => {
    if (!tree.visible) return;
    const now = JSON.stringify(view.projects());
    if (now === shown) return;
    shown = now;
    view.refresh();
  };
  const poll = setInterval(follow, FOLLOW_MS);

  watcher.onDidCreate(refreshSoon);
  watcher.onDidChange(refreshSoon);
  watcher.onDidDelete(refreshSoon);

  context.subscriptions.push(
    tree,
    watcher,
    { dispose: () => clearTimeout(timer) },
    { dispose: () => clearInterval(poll) },
    tree.onDidChangeVisibility(follow),
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
