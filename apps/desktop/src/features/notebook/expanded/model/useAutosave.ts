import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAutosave,
  type Autosave,
  type AutosaveOutcome,
  type AutosaveStatus,
} from "./autosave";

/** One second after the last change, matching FR-EDT-03. */
const DELAY_MS = 1000;

type Options = {
  /** Identifies what is being edited. A new key starts a fresh autosave. */
  editorKey: string;
  /** The text as it was last read from disk, for the new autosave to start from. */
  initial: string;
  /** Saves the current text in one write. Resolves whether it was saved. */
  commit: (text: string) => Promise<AutosaveOutcome>;
};

export type AutosaveField = {
  text: string;
  status: AutosaveStatus;
  message: string | null;
  onChange: (text: string) => void;
  onBlur: () => void;
};

/**
 * The React side of `createAutosave` (FR-EDT-03): holds the text a textarea
 * shows and the status a label shows. A new `editorKey` — a different
 * experiment or section — starts a fresh autosave seeded from `initial`;
 * unsaved text from the one before is saved, best-effort, first, so
 * switching what is selected never silently loses what was typed.
 *
 * `initial` and `commit` are read fresh on every render through a ref, not
 * as effect dependencies, so a change to either (for example after this
 * autosave's own save updates what is stored) does not restart the field
 * and throw local edits away; only `editorKey` does that, deliberately.
 */
export function useAutosave({
  editorKey,
  initial,
  commit,
}: Options): AutosaveField {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const latest = useRef({ initial, commit });
  useEffect(() => {
    latest.current = { initial, commit };
  });

  const autosaveRef = useRef<Autosave | null>(null);

  useEffect(() => {
    setText(latest.current.initial);
    setStatus("saved");
    setMessage(null);
    const autosave = createAutosave(latest.current.initial, {
      delayMs: DELAY_MS,
      commit: (value) => latest.current.commit(value),
      onStatus: (nextStatus, nextMessage) => {
        setStatus(nextStatus);
        setMessage(nextMessage);
      },
    });
    autosaveRef.current = autosave;
    return () => {
      autosave.dispose();
      autosaveRef.current = null;
    };
  }, [editorKey]);

  const onChange = useCallback((value: string) => {
    setText(value);
    autosaveRef.current?.change(value);
  }, []);

  const onBlur = useCallback(() => {
    void autosaveRef.current?.flush();
  }, []);

  return { text, status, message, onChange, onBlur };
}
