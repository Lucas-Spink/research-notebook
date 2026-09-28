import {
  capturedSourcePaths,
  type ArtefactsFileModel,
} from "@research-notebook/format";
import { useRef, useState } from "react";
import { Channel } from "../../../ipc/channel";
import type {
  DiscoveryFolder,
  DiscoveryProgressDto,
  DiscoveryResultDto,
  FolderHandle,
  commands,
} from "../../../ipc/bindings";
import type { NotebookActions } from "../useNotebook";
import { failureText, outcomeText, refusalText } from "./evidenceMessages";
import {
  addEvidenceFiles,
  type EvidenceApi,
  type EvidenceProject,
} from "./model/addEvidence";
import {
  defaultSelection,
  discoveredKey,
  discoveredToChosenFiles,
  patternsToText,
  textToPatterns,
} from "./model/discovery";

/** The commands the discovery dialog needs. */
export type DiscoveryApi = EvidenceApi &
  Pick<
    typeof commands,
    | "defaultDiscoveryExcludes"
    | "pickDiscoveryFolder"
    | "startDiscovery"
    | "cancelDiscovery"
  >;

export type DiscoveryOptions = {
  api: DiscoveryApi;
  folder: FolderHandle;
  projectId: string;
  experimentFolder: string;
  evidence: EvidenceProject;
  artefacts: ArtefactsFileModel;
  editArtefacts: NotebookActions["editArtefacts"];
};

/** Where the dialog is in choosing a folder and running a scan (FR-EVD-09). */
type Stage =
  | { kind: "closed" }
  | { kind: "pickingFolder" }
  | { kind: "editingOptions"; folder: DiscoveryFolder; label: string }
  | {
      kind: "scanning";
      folder: DiscoveryFolder;
      label: string;
      progress: DiscoveryProgressDto | null;
    }
  | {
      kind: "reviewing";
      folder: DiscoveryFolder;
      label: string;
      result: DiscoveryResultDto;
      selected: ReadonlySet<string>;
    };

export type Discovery = {
  stage: Stage;
  includeText: string;
  excludeText: string;
  setIncludeText: (text: string) => void;
  setExcludeText: (text: string) => void;
  /** One sentence per file added, or an error; none while nothing has happened. */
  notes: string[];
  close: () => void;
  pickFolder: () => Promise<void>;
  scan: () => Promise<void>;
  cancel: () => Promise<void>;
  toggle: (key: string) => void;
  selectAll: () => void;
  selectNone: () => void;
  addSelected: () => Promise<void>;
  dismiss: () => void;
};

/**
 * Choosing a folder to scan, running the scan with progress and cancel
 * (ADR-0035, ADR-0044 point 7), and adding the files the person selects from
 * what it found, through the same `addEvidenceFiles` an ordinary addition
 * uses. Only the current experiment's already-recorded sources are marked
 * as captured.
 */
export function useDiscovery({
  api,
  folder,
  projectId,
  experimentFolder,
  evidence,
  artefacts,
  editArtefacts,
}: DiscoveryOptions): Discovery {
  const [stage, setStage] = useState<Stage>({ kind: "closed" });
  const [includeText, setIncludeText] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  // Read when an action starts, not when it was rendered.
  const latest = useRef({ artefacts });
  latest.current = { artefacts };

  async function close() {
    if (stage.kind === "scanning") await api.cancelDiscovery();
    setStage({ kind: "closed" });
  }

  /** Opens the folder picker (FR-EVD-09), the dialog's one entry point. */
  async function pickFolder() {
    setStage({ kind: "pickingFolder" });
    setNotes([]);
    setIncludeText("");
    void api.defaultDiscoveryExcludes().then((excludes) => {
      setExcludeText(patternsToText(excludes));
    });
    const picked = await api.pickDiscoveryFolder(
      folder,
      projectId,
      evidence.externalRoots,
    );
    if (picked.status === "error") {
      setNotes([failureText(picked.error.kind)]);
      setStage({ kind: "closed" });
      return;
    }
    if (picked.data === null) {
      setStage({ kind: "closed" });
      return;
    }
    if (picked.data.kind === "refused") {
      setNotes([refusalText(picked.data.reason)]);
      setStage({ kind: "closed" });
      return;
    }
    setStage({
      kind: "editingOptions",
      folder: picked.data.folder,
      label: picked.data.name,
    });
  }

  async function scan() {
    if (stage.kind !== "editingOptions") return;
    const { folder: chosen, label } = stage;
    setStage({ kind: "scanning", folder: chosen, label, progress: null });
    const channel = new Channel<DiscoveryProgressDto>((progress) => {
      setStage((current) =>
        current.kind === "scanning" ? { ...current, progress } : current,
      );
    });
    const captured = capturedSourcePaths(
      [latest.current.artefacts],
      chosen.root,
      chosen.prefix ?? "",
    );
    const result = await api.startDiscovery(
      folder,
      projectId,
      chosen,
      {
        include: textToPatterns(includeText),
        exclude: textToPatterns(excludeText),
      },
      captured,
      channel,
    );
    if (result.status === "error") {
      setNotes([failureText(result.error.kind)]);
      setStage({ kind: "editingOptions", folder: chosen, label });
      return;
    }
    setStage({
      kind: "reviewing",
      folder: chosen,
      label,
      result: result.data,
      selected: defaultSelection(result.data.files),
    });
  }

  async function cancel() {
    await api.cancelDiscovery();
  }

  function toggle(key: string) {
    setStage((current) => {
      if (current.kind !== "reviewing") return current;
      const selected = new Set(current.selected);
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      return { ...current, selected };
    });
  }

  function selectAll() {
    setStage((current) =>
      current.kind === "reviewing"
        ? {
            ...current,
            selected: new Set(current.result.files.map(discoveredKey)),
          }
        : current,
    );
  }

  function selectNone() {
    setStage((current) =>
      current.kind === "reviewing"
        ? { ...current, selected: new Set() }
        : current,
    );
  }

  async function addSelected() {
    if (stage.kind !== "reviewing") return;
    const files = discoveredToChosenFiles(stage.result.files, stage.selected);
    if (files.length === 0) return;
    const outcomes = await addEvidenceFiles({
      api,
      folder,
      projectId,
      experimentFolder,
      copyThresholdMb: evidence.copyThresholdMb,
      files,
      artefacts: latest.current.artefacts,
      editArtefacts: (change) => editArtefacts(experimentFolder, change),
    });
    setNotes(outcomes.map(outcomeText));
    setStage({ kind: "closed" });
  }

  return {
    stage,
    includeText,
    excludeText,
    setIncludeText,
    setExcludeText,
    notes,
    close: () => void close(),
    pickFolder,
    scan,
    cancel,
    toggle,
    selectAll,
    selectNone,
    addSelected,
    dismiss: () => setNotes([]),
  };
}
