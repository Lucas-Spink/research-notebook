import { ConflictView } from "./ConflictView";
import { messages } from "./messages";
import type { Keep, Tracked } from "./model/tracker";

type Props = {
  files: Readonly<Record<string, Tracked>>;
  onResolve: (path: string, keep: Keep) => void;
};

/**
 * One conflict view for each file that has one, in path order, so that
 * whatever holds unsaved text shows a conflict without further wiring. It
 * renders nothing when there are none.
 */
export function ConflictPanel({ files, onResolve }: Props) {
  const conflicts = Object.values(files)
    .filter((tracked) => tracked.conflict !== null && tracked.unsaved !== null)
    .sort((a, b) => a.path.localeCompare(b.path));
  if (conflicts.length === 0) return null;
  return (
    <div aria-label={messages.panelLabel}>
      {conflicts.map((tracked) =>
        tracked.conflict === null || tracked.unsaved === null ? null : (
          <ConflictView
            key={tracked.path}
            path={tracked.path}
            mine={tracked.unsaved}
            theirs={tracked.conflict.theirs}
            onKeepMine={() => onResolve(tracked.path, "mine")}
            onUseTheirs={() => onResolve(tracked.path, "theirs")}
          />
        ),
      )}
    </div>
  );
}
