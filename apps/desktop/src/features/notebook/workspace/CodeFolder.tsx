import type {
  ArtefactModel,
  ArtefactsFileModel,
} from "@research-notebook/format";
import { commands, type FolderHandle } from "../../../ipc/bindings";
import { ArtefactTypeIcon, FolderIcon } from "../../../shared/ArtefactTypeIcon";
import type { TableEditing } from "../table/EditableSectionCell";
import type { EvidenceProject } from "../table/model/addEvidence";
import { useAddFiles } from "../table/useAddFiles";
import { resultsBrowserMessages as m } from "./messages";

type Props = {
  /** The experiment's artefacts.yaml. */
  file: ArtefactsFileModel;
  folder: FolderHandle;
  experimentFolder: string;
  editing: TableEditing;
  readOnly: boolean;
  /** Opens a script's preview in the side pane. */
  onOpen: (artefactId: string) => void;
};

/** The scripts an experiment links: its method artefacts, in the order they were recorded. */
export function scriptsOf(file: ArtefactsFileModel): ArtefactModel[] {
  return file.artefacts.filter((artefact) => artefact.role === "method");
}

/**
 * The Code folder of an experiment's Results browser (S6-T01): the default
 * place scripts are linked. A script stays where it is and is recorded as a
 * linked method artefact, so text can refer to it with a chip, as it can to
 * a figure, and its preview opens in the pane. Method artefacts are never
 * members of result groups (spec 5.8), so this folder is fixed and is not
 * organised like them.
 */
export function CodeFolder({
  file,
  folder,
  experimentFolder,
  editing,
  readOnly,
  onOpen,
}: Props) {
  const scripts = scriptsOf(file);
  return (
    <section className="code-folder" aria-label={m.codeFolder}>
      <header className="code-folder__head">
        <span className="results__icon results__icon--folder">
          <FolderIcon />
        </span>
        <strong>{m.codeFolder}</strong>
        <span className="results__count">{m.codeCount(scripts.length)}</span>
        {!readOnly &&
          editing.evidence !== null &&
          editing.projectId !== null && (
            <LinkScripts
              folder={folder}
              projectId={editing.projectId}
              experimentFolder={experimentFolder}
              evidence={editing.evidence}
              file={file}
              editing={editing}
            />
          )}
      </header>
      {scripts.length === 0 ? (
        <p className="wtable__muted">{m.codeEmpty}</p>
      ) : (
        <ul className="code-folder__list">
          {scripts.map((script) => (
            <li key={script.id}>
              <button
                type="button"
                className="code-folder__script"
                aria-label={m.scriptOpen(script.name)}
                onClick={() => onOpen(script.id)}
              >
                <span className="code-folder__name">{script.name}</span>
                <span className="results__icon">
                  <ArtefactTypeIcon type={script.type} />
                </span>
                <span className="code-folder__path">{script.source.path}</span>
                {script.mode === "link" && (
                  <span className="code-folder__tag">{m.linked}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkScripts({
  folder,
  projectId,
  experimentFolder,
  evidence,
  file,
  editing,
}: {
  folder: FolderHandle;
  projectId: string;
  experimentFolder: string;
  evidence: EvidenceProject;
  file: ArtefactsFileModel;
  editing: TableEditing;
}) {
  const add = useAddFiles({
    api: commands,
    folder,
    projectId,
    experimentFolder,
    evidence,
    artefacts: file,
    editArtefacts: editing.editArtefacts,
  });
  return (
    <>
      <button
        type="button"
        className="code-folder__link"
        disabled={add.busy}
        onClick={() => void add.pickScripts()}
      >
        {m.linkScript}
      </button>
      <div role="status" aria-live="polite" className="code-folder__notes">
        {add.notes.map((note, index) => (
          <p key={index}>{note}</p>
        ))}
      </div>
    </>
  );
}
