import { useCallback, useState } from "react";
import type { FileActionKind, FolderHandle } from "../../ipc/bindings";
import { panelMessages } from "./messages";
import type { PanelApi } from "./model/api";

/** Which file an action acts on: FR-PRV-02's actions work the same way for
 * a captured version and a linked artefact's source, resolved differently
 * by the command each is sent to. */
export type ActionTarget =
  | { kind: "captured"; file: string }
  | { kind: "linked"; root: string; path: string };

type Options = {
  api: PanelApi;
  folder: FolderHandle;
  projectId: string;
  target: ActionTarget;
};

/**
 * Open file, Reveal, Open in VS Code, Copy path and Open project folder
 * (FR-PRV-02). Each is fire-and-forget from the person's point of view: a
 * refusal is shown as a short message rather than a retryable failure
 * state, since the underlying problem (a missing file, an unresolved
 * root) is already shown elsewhere in the panel.
 */
export function useFileActions({ api, folder, projectId, target }: Options) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileKey =
    target.kind === "captured" ? target.file : `${target.root}:${target.path}`;

  const run = useCallback(
    async (action: FileActionKind) => {
      setBusy(true);
      setMessage(null);
      const result =
        target.kind === "captured"
          ? await api.openCapturedFileAction(folder, target.file, action)
          : await api.openLinkedFileAction(
              folder,
              projectId,
              target.root,
              target.path,
              action,
            );
      setBusy(false);
      if (result.status === "error") {
        setMessage(panelMessages.actionFailures[result.error.kind]);
      } else if (action === "copyPath") {
        setMessage(panelMessages.actions.copied);
      }
    },
    // `target` itself is not a dependency: `fileKey` already captures every
    // field of it that changes what this call does.
    [api, folder, projectId, target.kind, fileKey],
  );

  const openProjectFolder = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const result = await api.openProjectFolder(folder);
    setBusy(false);
    if (result.status === "error") {
      setMessage(panelMessages.actionFailures[result.error.kind]);
    }
  }, [api, folder]);

  return { busy, message, run, openProjectFolder };
}
