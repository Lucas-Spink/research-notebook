import type { RecentEntry } from "../../ipc/bindings";
import { messages } from "./messages";

type Props = {
  recent: RecentEntry[];
  busy: boolean;
  onOpen: (id: string) => void;
  onLocate: (id: string) => void;
};

/** The recent projects. One whose folder is gone offers Locate instead of Open (FR-PRJ-03). */
export function RecentList({ recent, busy, onOpen, onLocate }: Props) {
  if (recent.length === 0) return <p>{messages.noRecent}</p>;
  return (
    <ul className="projects__recent">
      {recent.map((entry) => (
        <li key={entry.id}>
          <div>
            <strong>{entry.name}</strong>
            <span className="projects__path">{entry.path}</span>
            {!entry.available && (
              <span className="projects__missing">{messages.missing}</span>
            )}
          </div>
          {entry.available ? (
            <button disabled={busy} onClick={() => onOpen(entry.id)}>
              {messages.openRecent}
            </button>
          ) : (
            <button disabled={busy} onClick={() => onLocate(entry.id)}>
              {messages.locate}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
