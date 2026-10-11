import { useId, useState, type FormEvent } from "react";
import { canvasMessages as m } from "./messages";

type Props = {
  initial: string;
  submitLabel: string;
  busy: boolean;
  /** Resolves whether the name was accepted; the form then closes through `onClose`. */
  onSubmit: (name: string) => Promise<boolean>;
  onClose: () => void;
};

/** One line of text for a canvas name, used for both a new canvas and a rename. */
export function InlineNameForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onClose,
}: Props) {
  const id = useId();
  const [name, setName] = useState(initial);

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSubmit(name).then((done) => {
      if (done) onClose();
    });
  }

  return (
    <form className="canvas-name-form" onSubmit={submit}>
      <label htmlFor={id} className="canvas-name-form__label">
        {m.nameLabel}
      </label>
      <input
        id={id}
        value={name}
        autoFocus
        disabled={busy}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      />
      <button type="submit" disabled={busy || name.trim().length === 0}>
        {submitLabel}
      </button>
      <button type="button" disabled={busy} onClick={onClose}>
        {m.cancel}
      </button>
    </form>
  );
}
