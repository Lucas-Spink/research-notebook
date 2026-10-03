import type { ArtefactsFileModel } from "@research-notebook/format";
import { useRef, useState } from "react";
import type { ChosenFile, FolderHandle, commands } from "../../../ipc/bindings";
import type { NotebookActions } from "../useNotebook";
import { outcomeText, pickFailureText, type AddHow } from "./evidenceMessages";
import {
  addEvidenceFiles,
  type EvidenceApi,
  type EvidenceProject,
} from "./model/addEvidence";

/** The commands adding files needs. */
export type AddFilesApi = EvidenceApi &
  Pick<typeof commands, "pickEvidenceFiles">;

export type AddFilesOptions = {
  api: AddFilesApi;
  folder: FolderHandle;
  projectId: string;
  /** The experiment's folder under `experiments/`. */
  experimentFolder: string;
  evidence: EvidenceProject;
  /** The experiment's artefacts.yaml as loaded; read again for every addition. */
  artefacts: ArtefactsFileModel;
  editArtefacts: NotebookActions["editArtefacts"];
};

export type AddFiles = {
  how: AddHow;
  setHow: (how: AddHow) => void;
  /** Choosing or adding is under way. */
  busy: boolean;
  /** One sentence per file of the last addition, or none. */
  notes: string[];
  /** Asks for files with the system picker, then adds them. */
  pick: () => Promise<void>;
  /** Asks for script files and links each, in place, into the Code folder. */
  pickScripts: () => Promise<void>;
  /** Adds files already chosen, as a drop does. */
  addChosen: (files: ChosenFile[]) => Promise<void>;
  dismiss: () => void;
};

/**
 * Adding files to one experiment from its Results cell (ADR-0044): the
 * "Add as" choice, the picker, and what happened to each file. Additions
 * never overlap, because each is decided against what the last recorded.
 */
export function useAddFiles({
  api,
  folder,
  projectId,
  experimentFolder,
  evidence,
  artefacts,
  editArtefacts,
}: AddFilesOptions): AddFiles {
  const [how, setHow] = useState<AddHow>("size");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  // Read when an addition starts, not when it was rendered.
  const latest = useRef({ artefacts, how });
  latest.current = { artefacts, how };
  const running = useRef(false);

  /** What an addition does apart from the "Add as" choice: scripts are always linked, as methods. */
  type Kind = "results" | "scripts";

  async function addChosen(files: ChosenFile[], kind: Kind = "results") {
    if (files.length === 0 || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const { how: chosenHow } = latest.current;
      const outcomes = await addEvidenceFiles({
        api,
        folder,
        projectId,
        experimentFolder,
        copyThresholdMb: evidence.copyThresholdMb,
        ...(kind === "scripts"
          ? { override: "link" as const, role: "method" as const }
          : chosenHow !== "size" && { override: chosenHow }),
        files,
        artefacts: latest.current.artefacts,
        editArtefacts: (change) => editArtefacts(experimentFolder, change),
      });
      setNotes(outcomes.map(outcomeText));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function pick(kind: Kind = "results") {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    let chosen: ChosenFile[] = [];
    try {
      const picked = await api.pickEvidenceFiles(
        folder,
        projectId,
        evidence.externalRoots,
      );
      if (picked.status === "error") {
        setNotes([pickFailureText(picked.error.kind)]);
      } else {
        chosen = picked.data;
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
    await addChosen(chosen, kind);
  }

  return {
    how,
    setHow,
    busy,
    notes,
    pick: () => pick(),
    pickScripts: () => pick("scripts"),
    addChosen: (files) => addChosen(files),
    dismiss: () => setNotes([]),
  };
}
