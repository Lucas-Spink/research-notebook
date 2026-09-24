import {
  parseSectionMarkdown,
  serialiseSectionMarkdown,
} from "@research-notebook/format";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useId, useMemo } from "react";
import { autosaveStatusText, editLabel } from "../messages";
import { liveEditorExtensions } from "./liveEditorExtensions";
import type { AutosaveField } from "./model/useAutosave";
import { StaticSectionContent } from "./StaticSectionContent";

type Props = {
  label: string;
  /** Identifies which experiment and section this is; a live editor resets when it changes. */
  editorKey: string;
  /** The section's text as currently stored, for a newly mounted live editor to start from. */
  initialMarkdown: string;
  field: AutosaveField;
  disabled: boolean;
  /** Whether this is the one section editor currently live (FR-EDT-03, S4-G08). */
  live: boolean;
  onActivate: () => void;
};

/**
 * One section (Methods, Results Notes or Interpretation): the live,
 * formatted Tiptap editor when it is the active one (FR-EDT-01, FR-EDT-02),
 * otherwise a static, read-only rendering of the same content that
 * activates it on click or Enter/Space. At most one of the three sections
 * mounts a live editor instance at a time (S4-G08).
 */
export function RichSectionEditor({
  label,
  editorKey,
  initialMarkdown,
  field,
  disabled,
  live,
  onActivate,
}: Props) {
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
      {live ? (
        <LiveEditor
          key={editorKey}
          id={id}
          label={label}
          initialMarkdown={initialMarkdown}
          field={field}
          disabled={disabled}
        />
      ) : (
        <StaticSection
          id={id}
          label={label}
          initialMarkdown={initialMarkdown}
          disabled={disabled}
          onActivate={onActivate}
        />
      )}
    </div>
  );
}

function LiveEditor({
  id,
  label,
  initialMarkdown,
  field,
  disabled,
}: {
  id: string;
  label: string;
  initialMarkdown: string;
  field: AutosaveField;
  disabled: boolean;
}) {
  const extensions = useMemo(() => liveEditorExtensions(), []);
  const editor = useEditor({
    extensions,
    content: parseSectionMarkdown(initialMarkdown),
    editable: !disabled,
    editorProps: { attributes: { id, "aria-label": label } },
    onUpdate: ({ editor: current }) => {
      field.onChange(serialiseSectionMarkdown(current.getJSON()));
    },
    onBlur: () => {
      field.onBlur();
    },
  });

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return <EditorContent editor={editor} className="expanded__editor" />;
}

function StaticSection({
  id,
  label,
  initialMarkdown,
  disabled,
  onActivate,
}: {
  id: string;
  label: string;
  initialMarkdown: string;
  disabled: boolean;
  onActivate: () => void;
}) {
  const doc = useMemo(
    () => parseSectionMarkdown(initialMarkdown),
    [initialMarkdown],
  );
  return (
    <div
      id={id}
      className="expanded__static-wrapper"
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={editLabel(label)}
      onClick={disabled ? undefined : onActivate}
      onKeyDown={
        disabled
          ? undefined
          : (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate();
              }
            }
      }
    >
      <StaticSectionContent doc={doc} />
    </div>
  );
}
