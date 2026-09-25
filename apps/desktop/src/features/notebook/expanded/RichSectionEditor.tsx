import type { ArtefactsFileModel } from "@research-notebook/format";
import {
  parseSectionMarkdown,
  serialiseSectionMarkdown,
} from "@research-notebook/format";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { autosaveStatusText, editLabel } from "../messages";
import { liveEditorExtensions } from "./liveEditorExtensions";
import { searchArtefacts } from "./model/artefactSearch";
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
  /** The experiment's artefacts, for the @ autocomplete (FR-EDT-04); `null` while unavailable. */
  artefacts: ArtefactsFileModel | null;
  /** Opens a reference's pinned version's preview (FR-EDT-06). */
  onActivateReference: (ulid: string, version: number | null) => void;
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
  artefacts,
  onActivateReference,
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
          artefacts={artefacts}
          onActivateReference={onActivateReference}
        />
      ) : (
        <StaticSection
          id={id}
          label={label}
          initialMarkdown={initialMarkdown}
          disabled={disabled}
          onActivate={onActivate}
          artefacts={artefacts}
          onActivateReference={onActivateReference}
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
  artefacts,
  onActivateReference,
}: {
  id: string;
  label: string;
  initialMarkdown: string;
  field: AutosaveField;
  disabled: boolean;
  artefacts: ArtefactsFileModel | null;
  onActivateReference: (ulid: string, version: number | null) => void;
}) {
  // Stable functions, read at call time: the suggestion plugin and the
  // chip's NodeView are built once per editor instance (below), but the
  // experiment's artefacts can arrive or change after that — these refs are
  // how they see the current ones without the editor's extensions (and so
  // the editor itself) being recreated every time they do.
  const artefactsRef = useRef(artefacts);
  artefactsRef.current = artefacts;
  const onActivateReferenceRef = useRef(onActivateReference);
  onActivateReferenceRef.current = onActivateReference;
  const search = useCallback((query: string) => {
    const file = artefactsRef.current;
    return file === null ? [] : searchArtefacts(file, query);
  }, []);
  const resolve = useCallback(() => artefactsRef.current, []);
  const activate = useCallback(
    (ulid: string, version: number | null) =>
      onActivateReferenceRef.current(ulid, version),
    [],
  );

  const extensions = useMemo(
    () => liveEditorExtensions(search, { resolve, onActivate: activate }),
    [search, resolve, activate],
  );
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
  artefacts,
  onActivateReference,
}: {
  id: string;
  label: string;
  initialMarkdown: string;
  disabled: boolean;
  onActivate: () => void;
  artefacts: ArtefactsFileModel | null;
  onActivateReference: (ulid: string, version: number | null) => void;
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
      <StaticSectionContent
        doc={doc}
        artefacts={artefacts}
        onActivateReference={onActivateReference}
      />
    </div>
  );
}
