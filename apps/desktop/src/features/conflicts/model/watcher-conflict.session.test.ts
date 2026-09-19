import { describe, expect, it } from "vitest";
import type { ChangedState } from "../../../ipc/bindings";
import type { ChangeReport } from "../../../ipc/bindings";
import { fakeApi, FOLDER, memoryStore, report } from "./fakeApi";
import { applyReport, recheck, type Api, type Files } from "./session";
import { edit, saving, saved, track } from "./tracker";

const Q1 = "_notebook/questions/Q-01.md";
const Q2 = "_notebook/questions/Q-02.md";
const present = (sha256: string): ChangedState => ({
  kind: "present",
  sha256,
});
const missing: ChangedState = { kind: "missing" };

/** Applies a report to files held in memory; `files` is what they are afterwards. */
async function apply(api: Api, files: Files, rep: ChangeReport) {
  const store = memoryStore(files);
  const applied = await applyReport(api, FOLDER, store, rep);
  return { ...applied, files: store.get() };
}

async function again(api: Api, files: Files, paths: readonly string[]) {
  const store = memoryStore(files);
  const applied = await recheck(api, FOLDER, store, paths);
  return { ...applied, files: store.get() };
}

const clean = (path: string, base: string | null = "h0"): Files => ({
  [path]: track(path, base),
});

describe("applying a change report to the files the application holds", () => {
  it("reloads a file with no unsaved edits, and hands the new text to its owner", async () => {
    const { api, reads } = fakeApi({ [Q1]: { text: "theirs", sha256: "h1" } });
    const applied = await apply(
      api,
      clean(Q1),
      report([{ path: Q1, state: present("h1") }]),
    );
    expect(reads).toEqual([Q1]);
    expect(applied.reloads).toEqual([
      { path: Q1, file: { text: "theirs", sha256: "h1" } },
    ]);
    expect(applied.files[Q1]?.base).toBe("h1");
    expect(applied.retry).toEqual([]);
  });

  it("uses the hash of the text it read, not the one it was told", async () => {
    // The file changed again between the report and the read.
    const { api } = fakeApi({ [Q1]: { text: "newer", sha256: "h2" } });
    const applied = await apply(
      api,
      clean(Q1),
      report([{ path: Q1, state: present("h1") }]),
    );
    expect(applied.files[Q1]?.base).toBe("h2");
    expect(applied.reloads[0]?.file?.text).toBe("newer");
  });

  it("tells the owner when the file was removed", async () => {
    const { api } = fakeApi({ [Q1]: "missing" });
    const applied = await apply(
      api,
      clean(Q1),
      report([{ path: Q1, state: missing }]),
    );
    expect(applied.reloads).toEqual([{ path: Q1, file: null }]);
    expect(applied.files[Q1]?.base).toBeNull();
  });

  it("keeps both versions of a file with unsaved edits and reloads nothing", async () => {
    const { api } = fakeApi({ [Q1]: { text: "their text", sha256: "h1" } });
    const files: Files = { [Q1]: edit(track(Q1, "h0"), "my text") };
    const applied = await apply(
      api,
      files,
      report([{ path: Q1, state: present("h1") }]),
    );
    expect(applied.reloads).toEqual([]);
    const held = applied.files[Q1];
    expect(held?.unsaved).toBe("my text");
    expect(held?.conflict).toEqual({
      theirs: { kind: "present", text: "their text", sha256: "h1" },
    });
  });

  it("records that they removed a file the person has edited", async () => {
    const { api } = fakeApi({ [Q1]: "missing" });
    const files: Files = { [Q1]: edit(track(Q1, "h0"), "my text") };
    const applied = await apply(
      api,
      files,
      report([{ path: Q1, state: missing }]),
    );
    expect(applied.files[Q1]?.conflict).toEqual({
      theirs: { kind: "missing" },
    });
    expect(applied.files[Q1]?.unsaved).toBe("my text");
  });

  it("does not read anything for the application's own save", async () => {
    const { api, reads } = fakeApi();
    const files: Files = {
      [Q1]: saving(edit(track(Q1, "h0"), "my text"), "h1"),
    };
    const applied = await apply(
      api,
      files,
      report([{ path: Q1, state: present("h1") }]),
    );
    expect(reads).toEqual([]);
    expect(applied.files[Q1]?.conflict).toBeNull();
    expect(applied.reloads).toEqual([]);
  });

  it("does not read anything for a file it is not holding", async () => {
    const { api, reads } = fakeApi();
    const applied = await apply(
      api,
      clean(Q1),
      report([{ path: Q2, state: present("h1") }]),
    );
    expect(reads).toEqual([]);
    expect(applied.files).toEqual(clean(Q1));
  });

  it("does not read anything for a change that leaves the file as it was", async () => {
    const { api, reads } = fakeApi();
    const applied = await apply(
      api,
      clean(Q1),
      report([{ path: Q1, state: present("h0") }]),
    );
    expect(reads).toEqual([]);
    expect(applied.reloads).toEqual([]);
  });

  it("ignores a file that could not be read by the watcher for now", async () => {
    const { api, reads } = fakeApi();
    const applied = await apply(
      api,
      clean(Q1),
      report([{ path: Q1, state: { kind: "unreadable" } }]),
    );
    expect(reads).toEqual([]);
    expect(applied.files).toEqual(clean(Q1));
  });

  it("asks for a second look when the file could not be read, leaving the state as it was", async () => {
    const { api } = fakeApi({ [Q1]: "error" });
    const files: Files = { [Q1]: edit(track(Q1, "h0"), "my text") };
    const applied = await apply(
      api,
      files,
      report([{ path: Q1, state: present("h1") }]),
    );
    expect(applied.retry).toEqual([Q1]);
    expect(applied.files[Q1]?.unsaved).toBe("my text");
    expect(applied.reloads).toEqual([]);
  });

  it("handles several files in one report, each on its own terms", async () => {
    const { api } = fakeApi({
      [Q1]: { text: "one", sha256: "h1" },
      [Q2]: { text: "two", sha256: "h2" },
    });
    const files: Files = {
      ...clean(Q1),
      [Q2]: edit(track(Q2, "h0"), "typed"),
    };
    const applied = await apply(
      api,
      files,
      report([
        { path: Q1, state: present("h1") },
        { path: Q2, state: present("h2") },
      ]),
    );
    expect(applied.reloads.map((r) => r.path)).toEqual([Q1]);
    expect(applied.files[Q2]?.conflict?.theirs.kind).toBe("present");
  });

  it("does not change the files it was given", async () => {
    const { api } = fakeApi({ [Q1]: { text: "theirs", sha256: "h1" } });
    const files = clean(Q1);
    const before = structuredClone(files);
    await apply(api, files, report([{ path: Q1, state: present("h1") }]));
    expect(files).toEqual(before);
  });
});

describe("a report that asks for everything to be checked again", () => {
  it("looks at every file it holds and acts only on those that differ", async () => {
    const { api, reads } = fakeApi({
      [Q1]: { text: "same", sha256: "h0" },
      [Q2]: { text: "changed", sha256: "h5" },
    });
    const files: Files = { ...clean(Q1), ...clean(Q2) };
    const applied = await apply(api, files, report([], true));
    expect(reads.sort()).toEqual([Q1, Q2]);
    expect(applied.reloads.map((r) => r.path)).toEqual([Q2]);
    expect(applied.files[Q1]?.base).toBe("h0");
    expect(applied.files[Q2]?.base).toBe("h5");
  });

  it("finds that a file has gone", async () => {
    const { api } = fakeApi({ [Q1]: "missing" });
    const applied = await apply(api, clean(Q1), report([], true));
    expect(applied.reloads).toEqual([{ path: Q1, file: null }]);
  });

  it("finds a conflict in a file the person has edited", async () => {
    const { api } = fakeApi({ [Q1]: { text: "theirs", sha256: "h9" } });
    const files: Files = { [Q1]: edit(track(Q1, "h0"), "mine") };
    const applied = await apply(api, files, report([], true));
    expect(applied.files[Q1]?.conflict?.theirs.kind).toBe("present");
    expect(applied.files[Q1]?.unsaved).toBe("mine");
  });

  it("leaves a file alone when it cannot be read now, and asks to look again", async () => {
    const { api } = fakeApi({ [Q1]: "error" });
    const applied = await apply(api, clean(Q1), report([], true));
    expect(applied.files).toEqual(clean(Q1));
    expect(applied.retry).toEqual([Q1]);
  });

  it("takes an own save that is in flight for what it is", async () => {
    const { api } = fakeApi({ [Q1]: { text: "saved text", sha256: "h1" } });
    const files: Files = {
      [Q1]: saved(saving(edit(track(Q1, "h0"), "saved text"), "h1"), "h1"),
    };
    const applied = await apply(api, files, report([], true));
    expect(applied.reloads).toEqual([]);
    expect(applied.files[Q1]?.conflict).toBeNull();
  });
});

describe("checking again the files a round could not read", () => {
  it("reloads a file that can be read now", async () => {
    const { api, set } = fakeApi({ [Q1]: "error" });
    const files = clean(Q1);
    const first = await apply(
      api,
      files,
      report([{ path: Q1, state: present("h1") }]),
    );
    expect(first.retry).toEqual([Q1]);

    set(Q1, { text: "theirs", sha256: "h1" });
    const second = await again(api, first.files, first.retry);
    expect(second.retry).toEqual([]);
    expect(second.reloads).toEqual([
      { path: Q1, file: { text: "theirs", sha256: "h1" } },
    ]);
    expect(second.files[Q1]?.base).toBe("h1");
  });

  it("keeps asking while the file still cannot be read", async () => {
    const { api } = fakeApi({ [Q1]: "error" });
    const second = await again(api, clean(Q1), [Q1]);
    expect(second.retry).toEqual([Q1]);
    expect(second.files).toEqual(clean(Q1));
  });

  it("skips a file it is not holding", async () => {
    const { api, reads } = fakeApi();
    const second = await again(api, clean(Q1), [Q2]);
    expect(reads).toEqual([]);
    expect(second.retry).toEqual([]);
  });
});

describe("typing while a file is being read", () => {
  it("is never overwritten by the reload, and becomes a conflict", async () => {
    const store = memoryStore(clean(Q1));
    // The person types once the read has started.
    const { api } = fakeApi({ [Q1]: { text: "theirs", sha256: "h1" } }, () =>
      store.put(
        Q1,
        edit(store.get()[Q1] ?? track(Q1, "h0"), "typed meanwhile"),
      ),
    );
    const applied = await applyReport(
      api,
      FOLDER,
      store,
      report([{ path: Q1, state: present("h1") }]),
    );
    const held = store.get()[Q1];
    expect(held?.unsaved).toBe("typed meanwhile");
    expect(held?.conflict).toEqual({
      theirs: { kind: "present", text: "theirs", sha256: "h1" },
    });
    expect(applied.reloads).toEqual([]);
  });

  it("is kept when their text arrives for a conflict already open", async () => {
    const store = memoryStore({ [Q1]: edit(track(Q1, "h0"), "mine") });
    const { api } = fakeApi({ [Q1]: { text: "theirs", sha256: "h1" } }, () =>
      store.put(Q1, edit(store.get()[Q1] ?? track(Q1, "h0"), "mine, and more")),
    );
    await applyReport(
      api,
      FOLDER,
      store,
      report([{ path: Q1, state: present("h1") }]),
    );
    expect(store.get()[Q1]?.unsaved).toBe("mine, and more");
    expect(store.get()[Q1]?.conflict?.theirs.kind).toBe("present");
  });
});
