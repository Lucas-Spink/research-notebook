import {
  addHowOptions,
  discoveryMessages,
  evidenceMessages,
  type AddHow,
} from "./evidenceMessages";
import type { RefObject } from "react";
import { DiscoveryDialog } from "./DiscoveryDialog";
import type { DropsApi } from "./dropsApi";
import {
  useAddFiles,
  type AddFilesApi,
  type AddFilesOptions,
} from "./useAddFiles";
import { useDiscovery, type DiscoveryApi } from "./useDiscovery";
import { useDropFiles } from "./useDropFiles";

type Props = Omit<AddFilesOptions, "api"> & {
  api: AddFilesApi & DiscoveryApi;
  /** The project or this experiment cannot be changed. */
  readOnly: boolean;
  /** The element files may be dropped on: the whole open Results cell. */
  zone: RefObject<HTMLElement | null>;
  drops: DropsApi;
  /** Laid out for the side pane: stacked, with a large area to drop files on. */
  pane?: boolean;
};

const isAddHow = (value: string): value is AddHow =>
  addHowOptions.some((option) => option.value === value);

/**
 * The controls for adding files to an open Results cell (FR-EVD-01,
 * FR-EVD-02): the picker, whether this addition copies or links whatever its
 * size, and what happened to each file, announced politely.
 */
export function AddFilesBar({
  readOnly,
  zone,
  drops,
  pane = false,
  ...options
}: Props) {
  const add = useAddFiles(options);
  const discovery = useDiscovery(options);
  const { dragging } = useDropFiles({
    api: drops,
    zone,
    enabled: !readOnly,
    folder: options.folder,
    projectId: options.projectId,
    externalRoots: options.evidence.externalRoots,
    onDrop: (files) => void add.addChosen(files),
  });
  return (
    <div
      className={`wtable__add${pane ? " wtable__add--pane" : ""}${dragging ? " wtable__add--drop" : ""}`}
    >
      <button
        type="button"
        onClick={() => void add.pick()}
        disabled={readOnly || add.busy}
      >
        {add.busy ? evidenceMessages.adding : evidenceMessages.addFiles}
      </button>
      <button
        type="button"
        onClick={() => void discovery.pickFolder()}
        disabled={readOnly}
      >
        {discoveryMessages.findFiles}
      </button>
      <DiscoveryDialog discovery={discovery} />
      {pane && (
        <>
          <button
            type="button"
            onClick={() => void add.pickScripts()}
            disabled={readOnly || add.busy}
          >
            {evidenceMessages.linkScripts}
          </button>
          <p className="wtable__muted">{evidenceMessages.linkScriptsHint}</p>
        </>
      )}
      <label className="wtable__add-how">
        {evidenceMessages.howLabel}
        <select
          value={add.how}
          disabled={readOnly || add.busy}
          onChange={(event) => {
            const { value } = event.target;
            if (isAddHow(value)) add.setHow(value);
          }}
        >
          {addHowOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {readOnly ? (
        <p className="wtable__muted">{evidenceMessages.readOnly}</p>
      ) : (
        <p className="wtable__muted">
          {dragging ? evidenceMessages.dropNow : evidenceMessages.dropHint}
        </p>
      )}
      <div role="status" aria-live="polite" className="wtable__add-notes">
        {add.notes.length === 0 ? null : (
          <>
            <ul>
              {add.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
            <button type="button" onClick={add.dismiss}>
              {evidenceMessages.dismiss}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
