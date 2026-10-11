import type { BinItem, FolderHandle } from "../../ipc/bindings";
import { binMessages as m } from "./messages";
import { binnedWhen, describeEntry } from "./model/entries";
import { useBin, type BinListApi, type RestoreResult } from "./useBin";

type Props = {
  api: BinListApi;
  folder: FolderHandle;
  /** Whether the project may be changed; Restore is offered only then. */
  writable: boolean;
  /** Puts one entry back, and says how it went. */
  onRestore: (entry: BinItem) => Promise<RestoreResult>;
};

/**
 * The Bin: what was moved to `.trash/` (questions, experiments, removed
 * files), each with Restore. Nothing is deleted from here, and there is no
 * Empty command: the person clears the bin by hand, outside the application.
 */
export function BinPanel({ api, folder, writable, onRestore }: Props) {
  const bin = useBin(api, folder, onRestore);
  return (
    <section className="bin" aria-labelledby="bin-heading">
      <h4 id="bin-heading">{m.heading}</h4>
      <p>{m.intro}</p>
      <p className="wtable__muted">{m.emptyingNote}</p>
      {!writable && <p className="wtable__muted">{m.readOnly}</p>}
      <button type="button" onClick={() => void bin.reload()}>
        {m.refresh}
      </button>
      <div role="status" aria-live="polite">
        {bin.notes.map((note, index) => (
          <p key={index}>{note}</p>
        ))}
      </div>
      {bin.state.status === "loading" && <p>{m.loading}</p>}
      {bin.state.status === "failed" && <p role="alert">{m.failed}</p>}
      {bin.state.status === "ready" && bin.state.items.length === 0 && (
        <p>{m.empty}</p>
      )}
      {bin.state.status === "ready" && bin.state.items.length > 0 && (
        <ul className="bin__list" aria-label={m.list}>
          {bin.state.items.map((entry) => {
            const { kind, title } = describeEntry(entry);
            return (
              <li key={`${entry.stamp}/${entry.kind}/${entry.name}`}>
                <strong>{kind}</strong> {title}
                <br />
                <span className="wtable__muted">
                  {m.movedOn(binnedWhen(entry.stamp))}
                </span>{" "}
                <button
                  type="button"
                  disabled={!writable || bin.busy}
                  aria-label={m.restoreLabel(`${kind} ${title}`)}
                  onClick={() => void bin.restore(entry)}
                >
                  {m.restore}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
