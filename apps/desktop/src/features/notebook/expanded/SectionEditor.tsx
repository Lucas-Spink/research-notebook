import { useId } from "react";
import { autosaveStatusText } from "../messages";
import type { AutosaveField } from "./model/useAutosave";

type Props = {
  label: string;
  field: AutosaveField;
  disabled: boolean;
};

/**
 * One section's plain-Markdown text (FR-EDT-01 to 03), autosaved: a labelled
 * field and its Saved, Saving, Unsaved or Error status, shown in words so it
 * is never colour alone (spec 10.2). Rich formatting and artefact references
 * are Stage 4 (ADR-0028).
 */
export function SectionEditor({ label, field, disabled }: Props) {
  const id = useId();
  return (
    <div className="expanded__field">
      <div className="expanded__field-head">
        <label htmlFor={id}>{label}</label>
        <span
          role="status"
          className={`expanded__status expanded__status--${field.status}`}
        >
          {autosaveStatusText(field.status, field.message)}
        </span>
      </div>
      <textarea
        id={id}
        className="expanded__textarea"
        value={field.text}
        disabled={disabled}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
      />
    </div>
  );
}
