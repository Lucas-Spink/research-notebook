import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCitationSearch,
  type CitationSearchState,
} from "./citationSearch";

const DELAY = 300;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A citation search whose searches the test resolves or rejects by hand. */
function setup() {
  const calls: string[] = [];
  const finish: Array<(state: CitationSearchState) => void> = [];
  const states: CitationSearchState[] = [];
  const search = createCitationSearch({
    delayMs: DELAY,
    search: (query) => {
      calls.push(query);
      return new Promise<CitationSearchState>((resolve) => {
        finish.push(resolve);
      });
    },
    onState: (state) => states.push(state),
  });
  const resolve = async (state: CitationSearchState) => {
    finish.shift()?.(state);
    await vi.advanceTimersByTimeAsync(0);
  };
  const last = () => states.at(-1);
  return { search, calls, resolve, last, states };
}

describe("createCitationSearch", () => {
  it("reports idle for an empty query, without searching", () => {
    const { search, calls, last } = setup();
    search.setQuery("");
    expect(last()).toEqual({ kind: "idle" });
    expect(calls).toEqual([]);
  });

  it("reports idle for whitespace-only text", () => {
    const { search, calls, last } = setup();
    search.setQuery("   ");
    expect(last()).toEqual({ kind: "idle" });
    expect(calls).toEqual([]);
  });

  it("reports loading at once, then searches once the delay elapses", async () => {
    const { search, calls, last } = setup();
    search.setQuery("widget");
    expect(last()).toEqual({ kind: "loading" });
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["widget"]);
  });

  it("restarts the delay on every change, searching only the final query", async () => {
    const { search, calls } = setup();
    search.setQuery("w");
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    search.setQuery("widget");
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["widget"]);
  });

  it("reports the search's outcome once it resolves", async () => {
    const { search, resolve, last } = setup();
    search.setQuery("widget");
    await vi.advanceTimersByTimeAsync(DELAY);
    await resolve({ kind: "ok", rows: [] });
    expect(last()).toEqual({ kind: "ok", rows: [] });
  });

  it("reports notRunning and disabled exactly as the search reports them", async () => {
    const { search, resolve, last } = setup();
    search.setQuery("widget");
    await vi.advanceTimersByTimeAsync(DELAY);
    await resolve({ kind: "notRunning" });
    expect(last()).toEqual({ kind: "notRunning" });

    search.setQuery("other");
    await vi.advanceTimersByTimeAsync(DELAY);
    await resolve({ kind: "disabled" });
    expect(last()).toEqual({ kind: "disabled" });
  });

  it("ignores a stale search's result once a newer query has been sent", async () => {
    const { search, resolve, last, calls } = setup();
    search.setQuery("first");
    await vi.advanceTimersByTimeAsync(DELAY);
    search.setQuery("second");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(calls).toEqual(["first", "second"]);

    await resolve({
      kind: "ok",
      rows: [
        {
          citekey: "z:u:AAAAAAAA",
          title: "First",
          creatorSummary: null,
          itemType: "book",
        },
      ],
    });
    // "second" is still in flight; the stale "first" result changed nothing.
    expect(last()).toEqual({ kind: "loading" });

    await resolve({ kind: "ok", rows: [] });
    expect(last()).toEqual({ kind: "ok", rows: [] });
  });

  it("reports error if the search itself rejects", async () => {
    const states: CitationSearchState[] = [];
    const search = createCitationSearch({
      delayMs: DELAY,
      search: () => Promise.reject(new Error("boom")),
      onState: (state) => states.push(state),
    });
    search.setQuery("widget");
    await vi.advanceTimersByTimeAsync(DELAY);
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toEqual({ kind: "error" });
  });

  it("does nothing after dispose", async () => {
    const { search, calls } = setup();
    search.dispose();
    search.setQuery("widget");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(calls).toEqual([]);
  });
});
