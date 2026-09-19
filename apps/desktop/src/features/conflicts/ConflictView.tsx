import { useId } from "react";
import { messages } from "./messages";
import type { Theirs } from "./model/tracker";
import "./ConflictView.css";

type Props = {
  /** The project-relative path of the file, shown so the person knows which one. */
  path: string;
  /** The person's unsaved text. */
  mine: string;
  theirs: Theirs;
  onKeepMine: () => void;
  onUseTheirs: () => void;
};

/** A version's text, or a note when it is empty so the box is not mistaken for missing. */
function Text({ text }: { text: string }) {
  return (
    <pre className="conflict__text" tabIndex={0}>
      {text === "" ? messages.emptyText : text}
    </pre>
  );
}

/**
 * Shows both versions of a file that changed on disk while it had unsaved
 * edits, and asks which to keep (FR-HIS-05, AC-11). Both stay in memory
 * until the person chooses, and neither choice happens by itself. The text
 * is rendered as text, never as markup.
 */
export function ConflictView({
  path,
  mine,
  theirs,
  onKeepMine,
  onUseTheirs,
}: Props) {
  const headingId = useId();
  const loading = theirs.kind === "loading";
  const removed = theirs.kind === "missing";
  return (
    <section role="alert" aria-labelledby={headingId} className="conflict">
      <h3 id={headingId}>{messages.heading}</h3>
      <p>
        {messages.fileLabel}: <code>{path}</code>
      </p>
      <p>{messages.intro}</p>
      <div className="conflict__sides">
        <div>
          <h4>{messages.mineHeading}</h4>
          <Text text={mine} />
        </div>
        <div>
          <h4>{messages.theirsHeading}</h4>
          {theirs.kind === "present" && <Text text={theirs.text} />}
          {loading && <p>{messages.theirsLoading}</p>}
          {removed && <p>{messages.theirsMissing}</p>}
        </div>
      </div>
      <div className="conflict__actions">
        <div>
          <button type="button" disabled={loading} onClick={onKeepMine}>
            {messages.keepMine}
          </button>
          <p>{messages.keepMineHint}</p>
        </div>
        <div>
          <button type="button" disabled={loading} onClick={onUseTheirs}>
            {removed ? messages.acceptRemoval : messages.useTheirs}
          </button>
          <p>{removed ? messages.acceptRemovalHint : messages.useTheirsHint}</p>
        </div>
      </div>
    </section>
  );
}
