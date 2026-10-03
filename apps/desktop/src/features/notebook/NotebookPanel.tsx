import type { ReactNode } from "react";
import { NotebookView } from "./NotebookView";
import type { ChangesPort } from "./model/api";
import { useNotebook } from "./useNotebook";
import type { FolderHandle } from "../../ipc/bindings";

type Props = {
  folder: FolderHandle;
  /** This window holds the project's lock. Otherwise the list is shown and nothing can be changed. */
  writable: boolean;
  changes: ChangesPort;
  /** The ribbon's Project group. */
  projectControls?: ReactNode;
  /** Project notices, kept under the ribbon. */
  projectBanners?: ReactNode;
};

/** The questions and experiments of the open project (FR-EXP-01 to 08). */
export function NotebookPanel({
  folder,
  writable,
  changes,
  projectControls,
  projectBanners,
}: Props) {
  const notebook = useNotebook({ folder, writable, changes });
  return (
    <NotebookView
      notebook={notebook}
      folder={folder}
      {...(projectControls === undefined ? {} : { projectControls })}
      {...(projectBanners === undefined ? {} : { projectBanners })}
    />
  );
}
