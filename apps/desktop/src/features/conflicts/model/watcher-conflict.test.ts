import { describe, expect, it } from "vitest";
import {
  discardEdits,
  edit,
  external,
  reloaded,
  resolve,
  saveFailed,
  saved,
  saving,
  theirsLoaded,
  track,
  type Disk,
  type Tracked,
} from "./tracker";

const PATH = "_notebook/questions/Q-01.md";
const present = (sha256: string): Disk => ({ kind: "present", sha256 });
const missing: Disk = { kind: "missing" };
const unreadable: Disk = { kind: "unreadable" };

/** A buffer loaded from disk version `h0`, then edited but not saved. */
function dirty(text = "my edit"): Tracked {
  return edit(track(PATH, "h0"), text);
}

describe("an outside change to a file with no unsaved edits", () => {
  it("is reloaded from disk", () => {
    const { tracked, effects } = external(track(PATH, "h0"), present("h1"));
    expect(effects).toEqual([{ kind: "reload", path: PATH }]);
    expect(tracked.conflict).toBeNull();
    expect(tracked.base).toBe("h0");
  });

  it("is taken as the new base once the reload has been read", () => {
    const step = external(track(PATH, "h0"), present("h1"));
    const after = reloaded(step.tracked, { text: "theirs", sha256: "h1" });
    expect(after.base).toBe("h1");
    expect(after.unsaved).toBeNull();
    expect(after.conflict).toBeNull();
  });

  it("asks for the file to be dropped when it was removed", () => {
    const { effects } = external(track(PATH, "h0"), missing);
    expect(effects).toEqual([{ kind: "gone", path: PATH }]);
  });

  it("is reloaded when the file appears and there was none", () => {
    const { effects } = external(track(PATH, null), present("h1"));
    expect(effects).toEqual([{ kind: "reload", path: PATH }]);
  });

  it("does nothing when a file that never existed stays missing", () => {
    const { tracked, effects } = external(track(PATH, null), missing);
    expect(effects).toEqual([]);
    expect(tracked).toEqual(track(PATH, null));
  });

  it("does nothing when the content is what the buffer is based on", () => {
    const { tracked, effects } = external(track(PATH, "h0"), present("h0"));
    expect(effects).toEqual([]);
    expect(tracked).toEqual(track(PATH, "h0"));
  });

  it("does nothing when the file could not be read for now", () => {
    const { tracked, effects } = external(track(PATH, "h0"), unreadable);
    expect(effects).toEqual([]);
    expect(tracked).toEqual(track(PATH, "h0"));
  });
});

describe("an outside change to a file with unsaved edits", () => {
  it("starts a conflict, keeps the local text and asks for theirs", () => {
    const { tracked, effects } = external(dirty(), present("h1"));
    expect(effects).toEqual([{ kind: "loadTheirs", path: PATH }]);
    expect(tracked.unsaved).toBe("my edit");
    expect(tracked.conflict).toEqual({ theirs: { kind: "loading" } });
    expect(tracked.base).toBe("h0");
  });

  it("never asks for a reload, which would overwrite the local text", () => {
    for (const disk of [present("h1"), missing]) {
      const { effects } = external(dirty(), disk);
      expect(effects.map((e) => e.kind)).not.toContain("reload");
      expect(effects.map((e) => e.kind)).not.toContain("gone");
    }
  });

  it("holds their text beside the local text once it has been read", () => {
    const started = external(dirty(), present("h1")).tracked;
    const after = theirsLoaded(started, { text: "their text", sha256: "h1" });
    expect(after.unsaved).toBe("my edit");
    expect(after.conflict).toEqual({
      theirs: { kind: "present", text: "their text", sha256: "h1" },
    });
  });

  it("records that they removed the file", () => {
    const started = external(dirty(), missing).tracked;
    expect(theirsLoaded(started, null).conflict).toEqual({
      theirs: { kind: "missing" },
    });
  });

  it("follows a second outside change while the conflict is open", () => {
    let t = external(dirty(), present("h1")).tracked;
    t = theirsLoaded(t, { text: "first", sha256: "h1" });
    const again = external(t, present("h2"));
    expect(again.effects).toEqual([{ kind: "loadTheirs", path: PATH }]);
    expect(again.tracked.conflict).toEqual({ theirs: { kind: "loading" } });
    const after = theirsLoaded(again.tracked, { text: "second", sha256: "h2" });
    expect(after.conflict).toEqual({
      theirs: { kind: "present", text: "second", sha256: "h2" },
    });
    expect(after.unsaved).toBe("my edit");
  });

  it("ends when they put the file back to what the buffer is based on", () => {
    let t = external(dirty(), present("h1")).tracked;
    t = theirsLoaded(t, { text: "first", sha256: "h1" });
    const back = external(t, present("h0"));
    expect(back.effects).toEqual([]);
    expect(back.tracked.conflict).toBeNull();
    expect(back.tracked.unsaved).toBe("my edit");
  });

  it("ends when the text read shows they put it back before it was read", () => {
    const started = external(dirty(), present("h1")).tracked;
    const after = theirsLoaded(started, { text: "original", sha256: "h0" });
    expect(after.conflict).toBeNull();
    expect(after.unsaved).toBe("my edit");
  });

  it("a text that arrives with no conflict open is ignored", () => {
    const t = dirty();
    expect(theirsLoaded(t, { text: "stray", sha256: "h9" })).toEqual(t);
  });

  it("a reload that arrives after the person started typing becomes a conflict", () => {
    const started = external(track(PATH, "h0"), present("h1")).tracked;
    const typed = edit(started, "typed meanwhile");
    const after = reloaded(typed, { text: "theirs", sha256: "h1" });
    expect(after.unsaved).toBe("typed meanwhile");
    expect(after.base).toBe("h0");
    expect(after.conflict).toEqual({
      theirs: { kind: "present", text: "theirs", sha256: "h1" },
    });
  });
});

describe("the application's own saves", () => {
  it("are not outside changes, even if the report arrives before the save is confirmed", () => {
    const t = saving(dirty("saved text"), "h1");
    const { tracked, effects } = external(t, present("h1"));
    expect(effects).toEqual([]);
    expect(tracked.conflict).toBeNull();
    expect(tracked.unsaved).toBe("saved text");
  });

  it("are not outside changes once confirmed", () => {
    const t = saved(saving(dirty("saved text"), "h1"), "h1");
    expect(t.base).toBe("h1");
    expect(t.unsaved).toBeNull();
    const { tracked, effects } = external(t, present("h1"));
    expect(effects).toEqual([]);
    expect(tracked).toEqual(t);
  });

  it("do not hide a different outside change made at the same moment", () => {
    const t = saving(dirty("saved text"), "h1");
    const { tracked, effects } = external(t, present("h2"));
    expect(effects).toEqual([{ kind: "loadTheirs", path: PATH }]);
    expect(tracked.conflict).not.toBeNull();
  });

  it("keep the text when the save failed, and stop expecting its report", () => {
    const failed = saveFailed(saving(dirty("saved text"), "h1"), "h1");
    expect(failed.unsaved).toBe("saved text");
    expect(failed.base).toBe("h0");
    const { effects } = external(failed, present("h1"));
    expect(effects).toEqual([{ kind: "loadTheirs", path: PATH }]);
  });

  it("keep what was typed while the save was in flight", () => {
    const typed = edit(saving(dirty("A"), "h1"), "AB");
    const done = saved(typed, "h1");
    expect(done.base).toBe("h1");
    expect(done.unsaved).toBe("AB");
  });

  it("clear only the text that was saved", () => {
    expect(saved(saving(dirty("A"), "h1"), "h1").unsaved).toBeNull();
  });

  it("confirmed without having been started keep the text and take the base", () => {
    const done = saved(dirty("A"), "h1");
    expect(done.base).toBe("h1");
    expect(done.unsaved).toBe("A");
  });

  it("are followed by a normal reload of a later outside edit", () => {
    const t = saved(saving(dirty(), "h1"), "h1");
    const { effects } = external(t, present("h2"));
    expect(effects).toEqual([{ kind: "reload", path: PATH }]);
  });

  it("do not disturb an open conflict", () => {
    const t = theirsLoaded(external(dirty(), present("h1")).tracked, {
      text: "theirs",
      sha256: "h1",
    });
    expect(saved(t, "h5")).toEqual(t);
  });
});

describe("editing", () => {
  it("replaces the unsaved text and keeps a conflict's theirs", () => {
    const t = theirsLoaded(external(dirty(), present("h1")).tracked, {
      text: "theirs",
      sha256: "h1",
    });
    const typed = edit(t, "more of mine");
    expect(typed.unsaved).toBe("more of mine");
    expect(typed.conflict).toEqual(t.conflict);
  });

  it("does not start a conflict by itself", () => {
    expect(edit(track(PATH, "h0"), "x").conflict).toBeNull();
  });

  it("discarding the edits of a clean buffer changes nothing", () => {
    expect(discardEdits(track(PATH, "h0"))).toEqual(track(PATH, "h0"));
  });

  it("discarding the edits is refused while a conflict is open", () => {
    const t = theirsLoaded(external(dirty(), present("h1")).tracked, {
      text: "theirs",
      sha256: "h1",
    });
    expect(discardEdits(t)).toEqual(t);
  });

  it("discarding the edits of a dirty buffer without a conflict clears them", () => {
    expect(discardEdits(dirty()).unsaved).toBeNull();
  });
});

describe("resolving a conflict", () => {
  const open = () =>
    theirsLoaded(external(dirty(), present("h1")).tracked, {
      text: "their text",
      sha256: "h1",
    });

  it("cannot be done while their text is still being read", () => {
    const loading = external(dirty(), present("h1")).tracked;
    const result = resolve(loading, "mine");
    expect(result.resolution).toEqual({ kind: "pending" });
    expect(result.tracked).toEqual(loading);
  });

  it("cannot be done when there is no conflict", () => {
    const result = resolve(dirty(), "theirs");
    expect(result.resolution).toEqual({ kind: "pending" });
    expect(result.tracked).toEqual(dirty());
  });

  it("keeping mine hands back the local text, based on their version", () => {
    const { tracked, resolution } = resolve(open(), "mine");
    expect(resolution).toEqual({ kind: "keepMine", text: "my edit" });
    expect(tracked.conflict).toBeNull();
    expect(tracked.unsaved).toBe("my edit");
    // Saving it now overwrites their version, knowingly.
    expect(tracked.base).toBe("h1");
  });

  it("keeping mine after they removed the file is based on no file", () => {
    const gone = theirsLoaded(external(dirty(), missing).tracked, null);
    const { tracked, resolution } = resolve(gone, "mine");
    expect(resolution).toEqual({ kind: "keepMine", text: "my edit" });
    expect(tracked.base).toBeNull();
  });

  it("using theirs hands back their text and says what was discarded", () => {
    const { tracked, resolution } = resolve(open(), "theirs");
    expect(resolution).toEqual({
      kind: "useTheirs",
      file: { text: "their text", sha256: "h1" },
      discarded: "my edit",
    });
    expect(tracked.conflict).toBeNull();
    expect(tracked.unsaved).toBeNull();
    expect(tracked.base).toBe("h1");
  });

  it("using theirs after they removed the file says the file is gone", () => {
    const gone = theirsLoaded(external(dirty(), missing).tracked, null);
    const { tracked, resolution } = resolve(gone, "theirs");
    expect(resolution).toEqual({
      kind: "useTheirs",
      file: null,
      discarded: "my edit",
    });
    expect(tracked.base).toBeNull();
    expect(tracked.unsaved).toBeNull();
  });

  it("after keeping mine, the same outside version is not a conflict again", () => {
    const { tracked } = resolve(open(), "mine");
    const { effects } = external(tracked, present("h1"));
    expect(effects).toEqual([]);
  });
});
