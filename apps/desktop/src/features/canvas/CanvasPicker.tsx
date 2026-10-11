import { useId, useState } from "react";
import { InlineNameForm } from "./InlineNameForm";
import { canvasMessages as m } from "./messages";
import { defaultCanvasName } from "./model/canvasFiles";
import type { CanvasesModel } from "./useCanvases";

type Mode = "idle" | "new" | "rename" | "delete";

/**
 * Which canvas is shown, with New, Rename and Delete. Each of the three asks
 * for what it needs before acting: a name for the first two, a confirmation
 * for the last. Delete only moves the canvas file to the trash.
 */
export function CanvasPicker({ model }: { model: CanvasesModel }) {
  const selectId = useId();
  const [mode, setMode] = useState<Mode>("idle");
  const { entries, selected, writable, busy } = model;
  const canChange = writable && !busy;
  const close = () => setMode("idle");

  if (mode === "new") {
    return (
      <InlineNameForm
        initial={defaultCanvasName(
          entries.flatMap((entry) => (entry.name === null ? [] : [entry.name])),
        )}
        submitLabel={m.newSubmit}
        busy={busy}
        onSubmit={(name) => model.create(name)}
        onClose={close}
      />
    );
  }
  if (mode === "rename" && selected?.name != null) {
    return (
      <InlineNameForm
        initial={selected.name}
        submitLabel={m.renameSubmit}
        busy={busy}
        onSubmit={(name) => model.rename(name)}
        onClose={close}
      />
    );
  }
  if (mode === "delete" && selected !== null) {
    return (
      <div
        role="group"
        aria-label={m.deleteHeading(selected.name ?? selected.fileName)}
        className="canvas-confirm"
      >
        <strong>{m.deleteHeading(selected.name ?? selected.fileName)}</strong>
        <span>{m.deleteBody}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void model.remove().then(close)}
        >
          {m.deleteConfirm}
        </button>
        <button type="button" disabled={busy} onClick={close}>
          {m.cancel}
        </button>
      </div>
    );
  }

  return (
    <div className="canvas-picker">
      <label htmlFor={selectId} className="canvas-picker__label">
        {m.pickerLabel}
      </label>
      <select
        id={selectId}
        value={selected?.fileName ?? ""}
        disabled={entries.length === 0}
        onChange={(event) => model.select(event.target.value)}
      >
        {entries.length === 0 && <option value="">{m.noCanvases}</option>}
        {entries.map((entry) => (
          <option key={entry.fileName} value={entry.fileName}>
            {entry.name ?? m.unreadableOption(entry.fileName)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!canChange}
        onClick={() => setMode("new")}
      >
        {m.newCanvas}
      </button>
      <button
        type="button"
        disabled={!canChange || selected?.file == null}
        onClick={() => setMode("rename")}
      >
        {m.rename}
      </button>
      <button
        type="button"
        disabled={!canChange || selected === null}
        onClick={() => setMode("delete")}
      >
        {m.remove}
      </button>
    </div>
  );
}
