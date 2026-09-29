import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useId, useState, type FormEvent } from "react";
import { messages } from "../messages";
import "./FormattingRibbon.css";

type Props = {
  /** The application's one live section editor (ADR-0043); `null` when none is open. */
  editor: Editor | null;
};

type ActiveMarks = {
  bold: boolean;
  italic: boolean;
  bulletList: boolean;
  orderedList: boolean;
  heading3: boolean;
  heading4: boolean;
};

const INACTIVE: ActiveMarks = {
  bold: false,
  italic: false,
  bulletList: false,
  orderedList: false,
  heading3: false,
  heading4: false,
};

function activeMarks(editor: Editor | null): ActiveMarks {
  if (editor === null) return INACTIVE;
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    heading3: editor.isActive("heading", { level: 3 }),
    heading4: editor.isActive("heading", { level: 4 }),
  };
}

/**
 * Formatting commands for whichever section editor is currently live
 * (FR-EDT-01, ADR-0043: there is only ever one), shown once at the top of
 * the table so the tools are visible before an editor is even open, Excel
 * ribbon style. Built from small, independent groups, so a later group (for
 * example table-wide tools) is an addition here, not a restructuring.
 */
export function FormattingRibbon({ editor }: Props) {
  const active =
    useEditorState({
      editor,
      selector: ({ editor: current }) => activeMarks(current),
    }) ?? INACTIVE;
  const disabled = editor === null;

  return (
    <div className="ribbon" role="toolbar" aria-label={messages.ribbonLabel}>
      <TextFormattingGroup
        editor={editor}
        active={active}
        disabled={disabled}
      />
      <span className="ribbon__divider" aria-hidden="true" />
      <InsertGroup editor={editor} disabled={disabled} />
      {disabled && <span className="ribbon__hint">{messages.ribbonHint}</span>}
    </div>
  );
}

function TextFormattingGroup({
  editor,
  active,
  disabled,
}: {
  editor: Editor | null;
  active: ActiveMarks;
  disabled: boolean;
}) {
  return (
    <div
      className="ribbon__group"
      role="group"
      aria-label={messages.ribbonTextGroupLabel}
    >
      <button
        type="button"
        aria-pressed={active.bold}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        {messages.ribbonBold}
      </button>
      <button
        type="button"
        aria-pressed={active.italic}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        {messages.ribbonItalic}
      </button>
      <button
        type="button"
        aria-pressed={active.bulletList}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        {messages.ribbonBulletList}
      </button>
      <button
        type="button"
        aria-pressed={active.orderedList}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        {messages.ribbonOrderedList}
      </button>
      <button
        type="button"
        aria-pressed={active.heading3}
        disabled={disabled}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        {messages.ribbonHeading3}
      </button>
      <button
        type="button"
        aria-pressed={active.heading4}
        disabled={disabled}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 4 }).run()
        }
      >
        {messages.ribbonHeading4}
      </button>
    </div>
  );
}

function InsertGroup({
  editor,
  disabled,
}: {
  editor: Editor | null;
  disabled: boolean;
}) {
  const [addingLink, setAddingLink] = useState(false);
  const [url, setUrl] = useState("");
  const urlId = useId();

  function submitLink(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (editor === null || trimmed === "") return;
    editor.chain().focus().setLink({ href: trimmed }).run();
    setUrl("");
    setAddingLink(false);
  }

  return (
    <div
      className="ribbon__group"
      role="group"
      aria-label={messages.ribbonInsertGroupLabel}
    >
      <button
        type="button"
        aria-expanded={addingLink}
        disabled={disabled}
        onClick={() => setAddingLink(!addingLink)}
      >
        {messages.ribbonLink}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor?.chain().focus().insertContent("@").run()}
      >
        {messages.ribbonReference}
      </button>
      {addingLink && (
        <form className="ribbon__link-form" onSubmit={submitLink}>
          <label htmlFor={urlId}>{messages.ribbonLinkUrlLabel}</label>
          <input
            id={urlId}
            value={url}
            placeholder={messages.ribbonLinkPlaceholder}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button type="submit" disabled={url.trim() === ""}>
            {messages.save}
          </button>
          <button type="button" onClick={() => setAddingLink(false)}>
            {messages.cancel}
          </button>
        </form>
      )}
    </div>
  );
}
