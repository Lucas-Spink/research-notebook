import type { TableSettingsChange } from "@research-notebook/format";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettingsCommitter } from "./settingsCommit";

/**
 * Saving the table's layout: a burst of changes is one write, a drag is saved
 * when it ends, and a read-only project keeps changes for the session only
 * (ADR-0025 warns that every save keeps a snapshot).
 */

const DELAY = 1000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A committer whose saves the test finishes by hand. */
function setup() {
  const commits: TableSettingsChange[] = [];
  const finish: Array<(ok: boolean) => void> = [];
  const unsaved: TableSettingsChange[] = [];
  const committer = createSettingsCommitter({
    delayMs: DELAY,
    commit: (change) => {
      commits.push(change);
      return new Promise<boolean>((resolve) => finish.push(resolve));
    },
    onUnsaved: (change) => unsaved.push(change),
  });
  const done = async (ok = true) => {
    finish.shift()?.(ok);
    await vi.advanceTimersByTimeAsync(0);
  };
  return { committer, commits, unsaved, done, last: () => unsaved.at(-1) };
}

describe("createSettingsCommitter", () => {
  it("saves a change once, after the delay, and not before", async () => {
    const { committer, commits, done } = setup();
    committer.change({ hidden: { results: true } });
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(commits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(commits).toEqual([{ hidden: { results: true } }]);
    await done();
  });

  it("makes a burst of changes one save of all of them, the last value of each winning", async () => {
    const { committer, commits, done } = setup();
    committer.change({ widths: { methods: 300 } });
    await vi.advanceTimersByTimeAsync(600);
    committer.change({ widths: { methods: 350, results: 400 } });
    await vi.advanceTimersByTimeAsync(600);
    // The second change restarted the wait.
    expect(commits).toEqual([]);
    committer.change({ collapsed: { q1: true } });
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(commits).toEqual([
      { widths: { methods: 350, results: 400 }, collapsed: { q1: true } },
    ]);
    await done();
  });

  it("saves at once when asked, as at the end of a drag", async () => {
    const { committer, commits, done } = setup();
    committer.change({ widths: { methods: 320 } }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(commits).toEqual([{ widths: { methods: 320 } }]);
    await done();
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(commits).toHaveLength(1);
  });

  it("reports what is not saved yet, until the save finishes", async () => {
    const { committer, unsaved, done, last } = setup();
    committer.change({ hidden: { results: true } });
    expect(last()).toEqual({ hidden: { results: true } });
    await vi.advanceTimersByTimeAsync(DELAY);
    // Under way: still shown, so the table does not flick back.
    expect(last()).toEqual({ hidden: { results: true } });
    await done();
    expect(last()).toEqual({});
    expect(unsaved.length).toBeGreaterThan(1);
  });

  it("stops reporting a change whose save failed, so the table shows what is on disk", async () => {
    const { committer, done, last } = setup();
    committer.change({ hidden: { results: true } }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    await done(false);
    expect(last()).toEqual({});
  });

  it("waits for a save under way before the next, so two never overlap", async () => {
    const { committer, commits, done } = setup();
    committer.change({ widths: { methods: 300 } }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    committer.change({ widths: { methods: 310 } }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(commits).toEqual([{ widths: { methods: 300 } }]);
    await done();
    expect(commits).toEqual([
      { widths: { methods: 300 } },
      { widths: { methods: 310 } },
    ]);
    await done();
  });

  it("keeps a change for the session only when it is not to be saved", async () => {
    const { committer, commits, last } = setup();
    committer.change({ hidden: { results: true } }, { persist: false });
    committer.change(
      { widths: { methods: 300 } },
      { persist: false, immediate: true },
    );
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(commits).toEqual([]);
    expect(last()).toEqual({
      hidden: { results: true },
      widths: { methods: 300 },
    });
  });

  it("flush saves what is waiting now and resolves when it is saved", async () => {
    const { committer, commits, done } = setup();
    committer.change({ collapsed: { q1: true } });
    let flushed = false;
    void committer.flush().then(() => {
      flushed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(commits).toEqual([{ collapsed: { q1: true } }]);
    expect(flushed).toBe(false);
    await done();
    expect(flushed).toBe(true);
  });

  it("saves nothing when nothing is waiting", async () => {
    const { committer, commits } = setup();
    await committer.flush();
    expect(commits).toEqual([]);
  });

  it("drops what is waiting when it is disposed, so nothing is saved to a project that closed", async () => {
    const { committer, commits } = setup();
    committer.change({ hidden: { results: true } });
    committer.dispose();
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(commits).toEqual([]);
  });
});
