import fc from "fast-check";
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
  type Effect,
  type FileText,
  type Tracked,
} from "./tracker";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);
const PATH = "_notebook/experiments/EXP-001/experiment.md";

const hashes = ["h0", "h1", "h2", "h3"] as const;
const hash = fc.constantFrom(...hashes);
const text = fc.constantFrom("mine A", "mine B", "");
const file: fc.Arbitrary<FileText | null> = fc.oneof(
  fc.constant(null),
  fc
    .tuple(hash, fc.constantFrom("their 1", "their 2"))
    .map(([sha256, t]) => ({ text: t, sha256 })),
);
const disk: fc.Arbitrary<Disk> = fc.oneof(
  hash.map((sha256): Disk => ({ kind: "present", sha256 })),
  fc.constant<Disk>({ kind: "missing" }),
  fc.constant<Disk>({ kind: "unreadable" }),
);

type Op =
  | { op: "edit"; text: string }
  | { op: "discard" }
  | { op: "saving"; sha: string }
  | { op: "saved"; sha: string }
  | { op: "saveFailed"; sha: string }
  | { op: "external"; disk: Disk }
  | { op: "reloaded"; file: FileText | null }
  | { op: "theirsLoaded"; file: FileText | null }
  | { op: "resolveMine" }
  | { op: "resolveTheirs" };

const ops: fc.Arbitrary<Op> = fc.oneof(
  text.map((t): Op => ({ op: "edit", text: t })),
  fc.constant<Op>({ op: "discard" }),
  hash.map((sha): Op => ({ op: "saving", sha })),
  hash.map((sha): Op => ({ op: "saved", sha })),
  hash.map((sha): Op => ({ op: "saveFailed", sha })),
  disk.map((d): Op => ({ op: "external", disk: d })),
  file.map((f): Op => ({ op: "reloaded", file: f })),
  file.map((f): Op => ({ op: "theirsLoaded", file: f })),
  fc.constant<Op>({ op: "resolveMine" }),
  fc.constant<Op>({ op: "resolveTheirs" }),
);

/** Runs one operation, returning the next state and anything the model asked for. */
function run(t: Tracked, o: Op): { next: Tracked; effects: Effect[] } {
  switch (o.op) {
    case "edit":
      return { next: edit(t, o.text), effects: [] };
    case "discard":
      return { next: discardEdits(t), effects: [] };
    case "saving":
      return { next: saving(t, o.sha), effects: [] };
    case "saved":
      return { next: saved(t, o.sha), effects: [] };
    case "saveFailed":
      return { next: saveFailed(t, o.sha), effects: [] };
    case "external": {
      const step = external(t, o.disk);
      return { next: step.tracked, effects: step.effects };
    }
    case "reloaded":
      return { next: reloaded(t, o.file), effects: [] };
    case "theirsLoaded":
      return { next: theirsLoaded(t, o.file), effects: [] };
    case "resolveMine":
      return { next: resolve(t, "mine").tracked, effects: [] };
    case "resolveTheirs":
      return { next: resolve(t, "theirs").tracked, effects: [] };
  }
}

const startBase = fc.constantFrom<string | null>(null, "h0");

describe("watcher-conflict: no version is ever lost, whatever the order", () => {
  it("keeps the local text unless the person chose to give it up", () => {
    fc.assert(
      fc.property(startBase, fc.array(ops, { maxLength: 40 }), (base, list) => {
        let t = track(PATH, base);
        for (const o of list) {
          const before = t;
          const { next } = run(t, o);
          t = next;
          // Only these operations may end, replace or begin the local text.
          const mayChange =
            o.op === "edit" ||
            o.op === "discard" ||
            o.op === "saved" ||
            o.op === "resolveTheirs";
          if (!mayChange) expect(t.unsaved).toBe(before.unsaved);
          if (o.op === "edit") expect(t.unsaved).toBe(o.text);
        }
      }),
      { numRuns },
    );
  });

  it("holds a conflict only while there is local text to conflict with", () => {
    fc.assert(
      fc.property(startBase, fc.array(ops, { maxLength: 40 }), (base, list) => {
        let t = track(PATH, base);
        for (const o of list) {
          t = run(t, o).next;
          if (t.conflict !== null) expect(t.unsaved).not.toBeNull();
        }
      }),
      { numRuns },
    );
  });

  it("never asks for a reload or a removal while there are unsaved edits", () => {
    fc.assert(
      fc.property(startBase, fc.array(ops, { maxLength: 40 }), (base, list) => {
        let t = track(PATH, base);
        for (const o of list) {
          const before = t;
          const { next, effects } = run(t, o);
          t = next;
          for (const effect of effects) {
            if (effect.kind === "reload" || effect.kind === "gone") {
              expect(before.unsaved).toBeNull();
              expect(next.conflict).toBeNull();
            }
          }
        }
      }),
      { numRuns },
    );
  });

  it("answers every outside change to a file with unsaved edits with a conflict", () => {
    fc.assert(
      fc.property(startBase, fc.array(ops, { maxLength: 40 }), (base, list) => {
        let t = track(PATH, base);
        for (const o of list) {
          const before = t;
          const { next } = run(t, o);
          t = next;
          if (o.op !== "external" || o.disk.kind === "unreadable") continue;
          const sha = o.disk.kind === "present" ? o.disk.sha256 : null;
          const isOwn =
            sha !== null && before.saving.some((s) => s.sha256 === sha);
          if (before.unsaved !== null && sha !== before.base && !isOwn) {
            expect(next.conflict).not.toBeNull();
          }
          if (before.unsaved === null && sha !== before.base && !isOwn) {
            // Not a conflict: it is either reloaded or already being.
            expect(next.conflict).toBeNull();
          }
        }
      }),
      { numRuns },
    );
  });

  it("never treats the version the buffer is based on as their side of a conflict", () => {
    fc.assert(
      fc.property(startBase, fc.array(ops, { maxLength: 40 }), (base, list) => {
        let t = track(PATH, base);
        for (const o of list) {
          t = run(t, o).next;
          const theirs = t.conflict?.theirs;
          if (theirs?.kind === "present")
            expect(theirs.sha256).not.toBe(t.base);
          if (theirs?.kind === "missing") expect(t.base).not.toBeNull();
        }
      }),
      { numRuns },
    );
  });

  it("an outside change never alters what the buffer is based on", () => {
    fc.assert(
      fc.property(startBase, fc.array(ops, { maxLength: 40 }), (base, list) => {
        let t = track(PATH, base);
        for (const o of list) {
          const before = t;
          t = run(t, o).next;
          if (o.op === "external") expect(t.base).toBe(before.base);
        }
      }),
      { numRuns },
    );
  });

  it("resolving hands back exactly what was held, and clears the conflict", () => {
    fc.assert(
      fc.property(startBase, fc.array(ops, { maxLength: 40 }), (base, list) => {
        let t = track(PATH, base);
        for (const o of list) {
          const before = t;
          t = run(t, o).next;
          if (o.op !== "resolveMine" && o.op !== "resolveTheirs") continue;
          const keep = o.op === "resolveMine" ? "mine" : "theirs";
          const { resolution } = resolve(before, keep);
          if (resolution.kind === "keepMine") {
            expect(resolution.text).toBe(before.unsaved);
            expect(t.conflict).toBeNull();
          } else if (resolution.kind === "useTheirs") {
            expect(resolution.discarded).toBe(before.unsaved);
            expect(t.conflict).toBeNull();
            expect(t.unsaved).toBeNull();
          } else {
            expect(t).toEqual(before);
          }
        }
      }),
      { numRuns },
    );
  });
});
