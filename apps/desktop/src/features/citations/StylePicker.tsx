import { styleMessages } from "./messages";
import type { StyleModel } from "./useStyleManagement";

/**
 * The project's citation style: pick a bundled style or import a `.csl` file
 * (FR-CIT-11). Renders what `useStyleManagement` holds and asks it to act.
 */
export function StylePicker({ model }: { model: StyleModel }) {
  const disabled = !model.writable || model.busy;
  return (
    <section aria-labelledby="style-heading" className="citations__style">
      <h4 id="style-heading">{styleMessages.heading}</h4>
      <label>
        {styleMessages.selectLabel}{" "}
        <select
          value={model.activeFile ?? ""}
          disabled={disabled || model.activeFile === null}
          onChange={(event) => model.choose(event.target.value)}
        >
          {model.options.map((option) => (
            <option key={option.file} value={option.file}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {styleMessages.importLabel}{" "}
        <input
          type="file"
          accept=".csl,.xml,text/xml,application/xml"
          disabled={disabled}
          onChange={(event) => {
            const [file] = event.target.files ?? [];
            if (file !== undefined) model.importFile(file);
            // Cleared so choosing the same file again after a refusal still fires.
            event.target.value = "";
          }}
        />
      </label>
      {model.usingDefault && <p>{styleMessages.defaultNote}</p>}
      <div role="status" aria-live="polite">
        {model.message}
      </div>
    </section>
  );
}
