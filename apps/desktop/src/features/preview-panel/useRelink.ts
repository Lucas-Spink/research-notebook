import { applyRelink } from "@research-notebook/format";
import { useState } from "react";
import type {
  FolderHandle,
  RelinkCandidateDto,
  commands,
} from "../../ipc/bindings";
import {
  relinkFailureText,
  relinkNotebookErrorText,
  relinkRefusalText,
} from "./messages";
import type { RelinkCapability } from "./model/relink";

/** The commands choosing a folder and listing candidates needs. */
export type RelinkApi = Pick<
  typeof commands,
  "pickDiscoveryFolder" | "listRelinkCandidates"
>;

type Stage =
  | { kind: "closed" }
  | { kind: "pickingFolder" }
  | { kind: "reviewing"; label: string; candidates: RelinkCandidateDto[] };

export type Relink = {
  stage: Stage;
  notes: string[];
  busy: boolean;
  pickFolder: () => Promise<void>;
  confirm: (candidate: RelinkCandidateDto) => Promise<void>;
  close: () => void;
  dismiss: () => void;
};

type Options = {
  api: RelinkApi;
  folder: FolderHandle;
  projectId: string;
  experimentFolder: string;
  artefactId: string;
  /** The last known name, size and hash a relink is looking for; `undefined`
   * when the artefact is not a link-mode one Relink applies to. */
  expectation: { fileName: string; size: number; sha256: string } | undefined;
  /** Left out, Relink is not offered here at all (`pickFolder` does nothing). */
  relink: RelinkCapability | undefined;
};

/**
 * Choosing a folder and listing its ranked candidates for one missing linked
 * artefact (FR-EVD-08, ADR-0031 §3), and recording the one the person
 * confirms. A candidate already carries its own observation, so confirming
 * it needs no second read (ADR-0044 point 7).
 */
export function useRelink({
  api,
  folder,
  projectId,
  experimentFolder,
  artefactId,
  expectation,
  relink,
}: Options): Relink {
  const [stage, setStage] = useState<Stage>({ kind: "closed" });
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function pickFolder() {
    if (expectation === undefined || relink === undefined) return;
    setNotes([]);
    setBusy(true);
    setStage({ kind: "pickingFolder" });
    try {
      const picked = await api.pickDiscoveryFolder(
        folder,
        projectId,
        relink.externalRoots,
      );
      if (picked.status === "error") {
        setNotes([relinkFailureText(picked.error.kind)]);
        setStage({ kind: "closed" });
        return;
      }
      if (picked.data === null) {
        setStage({ kind: "closed" });
        return;
      }
      if (picked.data.kind === "refused") {
        setNotes([relinkRefusalText(picked.data.reason.kind)]);
        setStage({ kind: "closed" });
        return;
      }
      const candidates = await api.listRelinkCandidates(
        folder,
        projectId,
        picked.data.folder,
        expectation.fileName,
        expectation.size,
        expectation.sha256,
      );
      if (candidates.status === "error") {
        setNotes([relinkFailureText(candidates.error.kind)]);
        setStage({ kind: "closed" });
        return;
      }
      setStage({
        kind: "reviewing",
        label: picked.data.name,
        candidates: candidates.data,
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(candidate: RelinkCandidateDto) {
    if (relink === undefined) return;
    setBusy(true);
    try {
      const saved = await relink.editArtefacts(
        experimentFolder,
        (file, env) => {
          const applied = applyRelink(
            file,
            artefactId,
            candidate.location,
            {
              sha256: candidate.sha256,
              size: candidate.size ?? 0,
              observedMtime: candidate.observedMtime,
            },
            env,
          );
          return applied.ok ? { ok: true, value: applied.value.file } : applied;
        },
      );
      if (!saved.ok) {
        // A `null` error means the notebook's own notice already explains it.
        if (saved.error !== null)
          setNotes([relinkNotebookErrorText(saved.error)]);
        return;
      }
      setStage({ kind: "closed" });
    } finally {
      setBusy(false);
    }
  }

  return {
    stage,
    notes,
    busy,
    pickFolder,
    confirm,
    close: () => setStage({ kind: "closed" }),
    dismiss: () => setNotes([]),
  };
}
