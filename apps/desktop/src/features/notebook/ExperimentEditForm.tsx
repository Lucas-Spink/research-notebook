import type {
  ExperimentChanges,
  ExperimentStatus,
  LoadedExperiment,
} from "@research-notebook/format";
import { useId, useState, type FormEvent } from "react";
import { messages, statusLabel, statusOptions } from "./messages";

type Props = {
  experiment: LoadedExperiment;
  disabled: boolean;
  onSave: (changes: ExperimentChanges) => Promise<boolean>;
  onClose: () => void;
};

/** Title, status and dates of one experiment (FR-EXP-05). An empty date clears it. */
export function ExperimentEditForm({
  experiment,
  disabled,
  onSave,
  onClose,
}: Props) {
  const ids = useId();
  const front = experiment.file.frontmatter;
  const [title, setTitle] = useState(front.title);
  const [status, setStatus] = useState<ExperimentStatus>(front.status);
  const [started, setStarted] = useState(front.started ?? "");
  const [completed, setCompleted] = useState(front.completed ?? "");

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSave({
      title,
      status,
      started: started === "" ? null : started,
      completed: completed === "" ? null : completed,
    }).then((done) => {
      if (done) onClose();
    });
  }

  return (
    <form className="notebook__edit" onSubmit={submit}>
      <label htmlFor={`${ids}-title`}>{messages.titleLabel}</label>
      <input
        id={`${ids}-title`}
        value={title}
        disabled={disabled}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor={`${ids}-status`}>{messages.statusLabel}</label>
      <select
        id={`${ids}-status`}
        value={status}
        disabled={disabled}
        onChange={(event) => {
          const chosen = statusOptions.find((s) => s === event.target.value);
          if (chosen !== undefined) setStatus(chosen);
        }}
      >
        {statusOptions.map((option) => (
          <option key={option} value={option}>
            {statusLabel(option)}
          </option>
        ))}
      </select>
      <label htmlFor={`${ids}-started`}>{messages.startedLabel}</label>
      <input
        id={`${ids}-started`}
        type="date"
        value={started}
        disabled={disabled}
        onChange={(event) => setStarted(event.target.value)}
      />
      <label htmlFor={`${ids}-completed`}>{messages.completedLabel}</label>
      <input
        id={`${ids}-completed`}
        type="date"
        value={completed}
        disabled={disabled}
        onChange={(event) => setCompleted(event.target.value)}
      />
      <button type="submit" disabled={disabled}>
        {messages.save}
      </button>
      <button type="button" onClick={onClose}>
        {messages.cancel}
      </button>
    </form>
  );
}
