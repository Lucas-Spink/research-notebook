import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAutosave,
  type AutosaveOutcome,
  type AutosaveStatus,
} from "./autosave";

/**
 * FR-EDT-03: autosave one second after the last change and on blur, showing
 * Saved, Saving, Unsaved or Error.
 */

const DELAY = 1000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** An autosave whose saves the test finishes by hand. */
function setup(initial = "") {
  const commits: string[] = [];
  const finish: Array<(outcome: AutosaveOutcome) => void> = [];
  const statuses: Array<{ status: AutosaveStatus; message: string | null }> =
    [];
  const autosave = createAutosave(initial, {
    delayMs: DELAY,
    commit: (text) => {
      commits.push(text);
      return new Promise<AutosaveOutcome>((resolve) => finish.push(resolve));
    },
    onStatus: (status, message) => statuses.push({ status, message }),
  });
  const resolve = async (outcome: AutosaveOutcome = { ok: true }) => {
    finish.shift()?.(outcome);
    await vi.advanceTimersByTimeAsync(0);
  };
  const last = () => statuses.at(-1);
  return { autosave, commits, statuses, resolve, last };
}

describe("createAutosave", () => {
  it("reports unsaved at once, then saves once, one second after the change", async () => {
    const { autosave, commits, resolve, last } = setup("");
    autosave.change("a");
    expect(last()?.status).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(commits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(commits).toEqual(["a"]);
    expect(last()?.status).toBe("saving");
    await resolve();
    expect(last()?.status).toBe("saved");
  });

  it("debounces a burst of changes to one save of the latest text", async () => {
    const { autosave, commits, resolve } = setup("");
    autosave.change("a");
    await vi.advanceTimersByTimeAsync(600);
    autosave.change("ab");
    await vi.advanceTimersByTimeAsync(600);
    expect(commits).toEqual([]);
    autosave.change("abc");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(commits).toEqual(["abc"]);
    await resolve();
  });

  it("shows saved at once when the text goes back to what is on disk, without saving", async () => {
    const { autosave, commits, last } = setup("a");
    autosave.change("ab");
    expect(last()?.status).toBe("unsaved");
    autosave.change("a");
    expect(last()?.status).toBe("saved");
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(commits).toEqual([]);
  });

  it("flush saves at once, for blur, without waiting for the debounce", async () => {
    const { autosave, commits, resolve } = setup("");
    autosave.change("a");
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(commits).toEqual(["a"]);
    await resolve();
  });

  it("flush resolves once the save finishes", async () => {
    const { autosave, resolve } = setup("");
    autosave.change("a");
    let flushed = false;
    void autosave.flush().then(() => {
      flushed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(false);
    await resolve();
    expect(flushed).toBe(true);
  });

  it("flush does nothing when the text is already saved", async () => {
    const { autosave, commits } = setup("a");
    await autosave.flush();
    expect(commits).toEqual([]);
  });

  it("keeps the typed text and shows an error when the save fails, without retrying on its own", async () => {
    const { autosave, commits, resolve, last } = setup("");
    autosave.change("a");
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    await resolve({ ok: false, message: "Enter a title on one line." });
    expect(last()).toEqual({
      status: "error",
      message: "Enter a title on one line.",
    });
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(commits).toEqual(["a"]);
  });

  it("retries on the next change after an error", async () => {
    const { autosave, commits, resolve, last } = setup("");
    autosave.change("a");
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    await resolve({ ok: false, message: null });
    autosave.change("ab");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(commits).toEqual(["a", "ab"]);
    await resolve();
    expect(last()?.status).toBe("saved");
  });

  it("retries on flush after an error", async () => {
    const { autosave, commits, resolve } = setup("");
    autosave.change("a");
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    await resolve({ ok: false, message: null });
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(commits).toEqual(["a", "a"]);
    await resolve();
  });

  it("does not lose a change made while a save is in flight", async () => {
    const { autosave, commits, resolve, last } = setup("");
    autosave.change("a");
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    autosave.change("ab");
    await resolve();
    expect(last()?.status).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(commits).toEqual(["a", "ab"]);
    await resolve();
    expect(last()?.status).toBe("saved");
  });

  it("never starts a second save while one is in flight", async () => {
    const { autosave, commits, resolve } = setup("");
    autosave.change("a");
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    autosave.change("ab");
    autosave.change("abc");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(commits).toEqual(["a"]);
    await resolve();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(commits).toEqual(["a", "abc"]);
    await resolve();
  });

  it("does not report a status after it is disposed", async () => {
    const { autosave, resolve, statuses } = setup("");
    autosave.change("a");
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    autosave.dispose();
    const before = statuses.length;
    await resolve();
    expect(statuses.length).toBe(before);
  });

  it("makes a best-effort save of unsaved text when disposed, e.g. switching projects", async () => {
    const { autosave, commits } = setup("");
    autosave.change("a");
    autosave.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(commits).toEqual(["a"]);
  });

  it("does not save anything on dispose when the text is already saved", async () => {
    const { autosave, commits } = setup("a");
    autosave.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(commits).toEqual([]);
  });

  it("stops a pending debounce timer once disposed", async () => {
    const { autosave, commits, resolve } = setup("");
    autosave.change("a");
    await vi.advanceTimersByTimeAsync(0);
    autosave.dispose();
    await resolve(); // the best-effort save from dispose()
    commits.length = 0;
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(commits).toEqual([]);
  });

  it("is settled only when nothing is unsaved and no save is in flight", async () => {
    const { autosave, resolve } = setup("");
    expect(autosave.isSettled()).toBe(true);
    autosave.change("a");
    expect(autosave.isSettled()).toBe(false);
    const flushed = autosave.flush();
    expect(autosave.isSettled()).toBe(false);
    await resolve();
    await flushed;
    expect(autosave.isSettled()).toBe(true);
  });

  it("is not settled after a save fails, since the text is still unsaved", async () => {
    const { autosave, resolve } = setup("");
    autosave.change("a");
    const flushed = autosave.flush();
    await resolve({ ok: false, message: "Disk full" });
    await flushed;
    expect(autosave.isSettled()).toBe(false);
  });
});
