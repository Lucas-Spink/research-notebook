/** FR-EDT-03: Saved, Saving, Unsaved or Error, shown for one editor. */
export type AutosaveStatus = "saved" | "saving" | "unsaved" | "error";

export type AutosaveOutcome =
  { ok: true } | { ok: false; message: string | null };

type Options = {
  /** How long a change waits, with no other, before it is saved. */
  delayMs: number;
  /** Saves `text` in one write. Resolves whether it was saved, and why not. */
  commit: (text: string) => Promise<AutosaveOutcome>;
  /** Called whenever the status changes, for the editor to show. */
  onStatus: (status: AutosaveStatus, message: string | null) => void;
};

export type Autosave = {
  /** The text changed; call on every keystroke. */
  change(text: string): void;
  /** Saves at once (e.g. on blur), without waiting for the debounce. Resolves once settled. */
  flush(): Promise<void>;
  /** Whether everything typed is saved and no save is in flight. */
  isSettled(): boolean;
  /**
   * Stops the timer. Unsaved text is saved once, best-effort, so switching
   * projects while mid-sentence does not lose it; nothing is reported
   * afterwards.
   */
  dispose(): void;
};

/**
 * Autosaves one section's text (FR-EDT-03): one second after the last
 * change, and at once on `flush`. A save that fails leaves the text as it
 * is — never reverted — and shows `error`; the next change or flush tries
 * again. Saves never overlap; a change made while one is in flight is picked
 * up once it settles.
 */
export function createAutosave(initial: string, options: Options): Autosave {
  let current = initial;
  let saved = initial;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;

  const isDirty = () => current !== saved;

  function report(status: AutosaveStatus, message: string | null = null) {
    if (!disposed) options.onStatus(status, message);
  }

  function stopTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    stopTimer();
    timer = setTimeout(() => void runAttempt(), options.delayMs);
  }

  async function attempt(): Promise<void> {
    if (disposed || !isDirty()) return;
    const text = current;
    report("saving");
    const outcome = await options
      .commit(text)
      .catch((): AutosaveOutcome => ({ ok: false, message: null }));
    if (disposed) return;
    if (!outcome.ok) {
      report("error", outcome.message);
      return;
    }
    saved = text;
    if (isDirty()) {
      // Typed further while this save was in flight: not lost, save it next.
      report("unsaved");
      schedule();
    } else {
      report("saved");
    }
  }

  function runAttempt(): Promise<void> {
    stopTimer();
    running ??= attempt().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    change(text) {
      if (disposed) return;
      current = text;
      if (!isDirty()) {
        stopTimer();
        if (running === null) report("saved");
        return;
      }
      if (running === null) report("unsaved");
      schedule();
    },
    flush: runAttempt,
    isSettled: () => !isDirty() && running === null,
    dispose() {
      stopTimer();
      if (isDirty() && running === null) {
        // Fire-and-forget: nobody is left to show the outcome to.
        void options.commit(current).catch(() => undefined);
      }
      disposed = true;
    },
  };
}
