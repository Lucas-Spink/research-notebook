import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { resultsMessages } from "./messages";

type Props = {
  label: string;
  initial?: string;
  placeholder?: string;
  submitLabel: string;
  disabled: boolean;
  /** Takes focus when shown, for a form opened from a row's actions. */
  focusOnShow?: boolean;
  /** Resolves `true` when it was carried out; the field is then reset. */
  onSubmit: (name: string) => Promise<boolean>;
  onCancel?: () => void;
};

/** One field for a group name: a new group, a new subgroup or a rename. */
export function NameForm({
  label,
  initial = "",
  placeholder,
  submitLabel,
  disabled,
  focusOnShow = false,
  onSubmit,
  onCancel,
}: Props) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial);

  useEffect(() => {
    if (focusOnShow) input.current?.focus();
  }, [focusOnShow]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSubmit(name).then((done) => {
      if (done) setName(initial);
    });
  }

  return (
    <form
      className="results__name"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onCancel !== undefined) onCancel();
      }}
    >
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        ref={input}
        value={name}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={disabled || name.trim() === ""}>
        {submitLabel}
      </button>
      {onCancel !== undefined && (
        <button type="button" onClick={onCancel}>
          {resultsMessages.cancel}
        </button>
      )}
    </form>
  );
}
