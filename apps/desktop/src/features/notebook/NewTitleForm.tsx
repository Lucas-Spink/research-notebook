import { useId, useState, type FormEvent } from "react";

type Props = {
  label: string;
  placeholder?: string;
  submitLabel: string;
  disabled: boolean;
  /** Resolves `true` when it was carried out, and the field is then cleared. */
  onSubmit: (title: string) => Promise<boolean>;
};

/** One field for a title and the button that adds it: a new question, or a new experiment. */
export function NewTitleForm({
  label,
  placeholder,
  submitLabel,
  disabled,
  onSubmit,
}: Props) {
  const inputId = useId();
  const [title, setTitle] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSubmit(title).then((done) => {
      if (done) setTitle("");
    });
  }

  return (
    <form className="notebook__new" onSubmit={submit}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        value={title}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button type="submit" disabled={disabled}>
        {submitLabel}
      </button>
    </form>
  );
}
