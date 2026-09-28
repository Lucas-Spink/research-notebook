import {
  addHowOptions,
  evidenceMessages,
  type AddHow,
} from "./evidenceMessages";
import type { RefObject } from "react";
import type { DropsApi } from "./dropsApi";
import { useAddFiles, type AddFilesOptions } from "./useAddFiles";
import { useDropFiles } from "./useDropFiles";

type Props = AddFilesOptions & {
  /** The project or this experiment cannot be changed. */
  readOnly: boolean;
  /** The element files may be dropped on: the whole open Results cell. */
  zone: RefObject<HTMLElement | null>;
  drops: DropsApi;
};

const isAddHow = (value: string): value is AddHow =>
  addHowOptions.some((option) => option.value === value);

/**
 * The controls for adding files to an open Results cell (FR-EVD-01,
 * FR-EVD-02): the picker, whether this addition copies or links whatever its
 * size, and what happened to each file, announced politely.
 */
export function AddFilesBar({ readOnly, zone, drops, ...options }: Props) {
  const add = useAddFiles(options);
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
    <div className={dragging ? "wtable__add wtable__add--drop" : "wtable__add"}>
      <button
        type="button"
        onClick={() => void add.pick()}
        disabled={readOnly || add.busy}
      >
        {add.busy ? evidenceMessages.adding : evidenceMessages.addFiles}
      </button>
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
