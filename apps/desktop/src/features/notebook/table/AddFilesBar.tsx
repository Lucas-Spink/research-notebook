import {
  addHowOptions,
  evidenceMessages,
  type AddHow,
} from "./evidenceMessages";
import { useAddFiles, type AddFilesOptions } from "./useAddFiles";

type Props = AddFilesOptions & {
  /** The project or this experiment cannot be changed. */
  readOnly: boolean;
};

const isAddHow = (value: string): value is AddHow =>
  addHowOptions.some((option) => option.value === value);

/**
 * The controls for adding files to an open Results cell (FR-EVD-01,
 * FR-EVD-02): the picker, whether this addition copies or links whatever its
 * size, and what happened to each file, announced politely.
 */
export function AddFilesBar({ readOnly, ...options }: Props) {
  const add = useAddFiles(options);
  return (
    <div className="wtable__add">
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
      ) : null}
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
