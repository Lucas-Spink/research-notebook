import type { Arranged, RecognisedSectionKey } from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutosaveOutcome } from "../expanded/model/autosave";
import { sampleNotebook } from "../model/fakeApi";
import type { LiveTarget } from "./model/liveEditor";
import { useLiveEditor, type LiveEditor } from "./useLiveEditor";

/**
 * FR-EDT-03 as amended by ADR-0043: one live section for the whole
 * application, whose pending text is saved before another section opens.
 */

const { state } = sampleNotebook();
const [first, second] = state.experiments;
const question = state.questions[0];
if (first === undefined || second === undefined || question === undefined) {
  throw new Error("sample");
}

const arrangedWith = (readOnlyFirst = false, withFirst = true): Arranged => ({
  questions: [
    {
      question,
      readOnly: false,
      experiments: [
        ...(withFirst
          ? [
              {
                experiment: first,
                readOnly: readOnlyFirst,
                absentFromOrder: false,
              },
            ]
          : []),
        { experiment: second, readOnly: false, absentFromOrder: false },
      ],
    },
  ],
  unassigned: [],
  problems: [],
});

const methodsOfFirst: LiveTarget = { folder: first.folder, section: "methods" };
const notesOfFirst: LiveTarget = {
  folder: first.folder,
  section: "results_notes",
};
const methodsOfSecond: LiveTarget = {
  folder: second.folder,
  section: "methods",
};

type Save = {
  calls: Array<[string, RecognisedSectionKey, string]>;
  finish: (outcome?: AutosaveOutcome) => Promise<void>;
  fn: (
    id: string,
    key: RecognisedSectionKey,
    text: string,
  ) => Promise<AutosaveOutcome>;
};

function manualSave(): Save {
  const calls: Save["calls"] = [];
  const pending: Array<(outcome: AutosaveOutcome) => void> = [];
  return {
    calls,
    fn: (id, key, text) => {
      calls.push([id, key, text]);
      return new Promise((resolve) => pending.push(resolve));
    },
    finish: async (outcome = { ok: true }) => {
      await act(async () => {
        pending.shift()?.(outcome);
        await vi.advanceTimersByTimeAsync(0);
      });
    },
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let live: LiveEditor | null = null;

function Harness({ arranged, save }: { arranged: Arranged; save: Save["fn"] }) {
  live = useLiveEditor({ arranged, save });
  return null;
}

function current(): LiveEditor {
  if (live === null) throw new Error("not mounted");
  return live;
}

function mount(save: Save, arranged: Arranged = arrangedWith()) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness arranged={arranged} save={save.fn} />));
}

function rerender(save: Save, arranged: Arranged) {
  act(() => root?.render(<Harness arranged={arranged} save={save.fn} />));
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  live = null;
  vi.useRealTimers();
});

describe("useLiveEditor", () => {
  it("has no live section until one is activated, then starts from its stored text", async () => {
    const save = manualSave();
    mount(save);
    expect(current().target).toBeNull();
    await act(() => current().activate(methodsOfFirst));
    expect(current().target).toEqual(methodsOfFirst);
    expect(current().field.text).toBe(
      first.file.body.sections.find((s) => s.key === "methods")?.body ?? "",
    );
  });

  it("switches at once when nothing is unsaved, without saving", () => {
    const save = manualSave();
    mount(save);
    act(() => void current().activate(methodsOfFirst));
    act(() => void current().activate(notesOfFirst));
    expect(current().target).toEqual(notesOfFirst);
    expect(save.calls).toEqual([]);
  });

  it("saves pending text immediately, and only then opens the next section", async () => {
    const save = manualSave();
    mount(save);
    act(() => void current().activate(methodsOfFirst));
    act(() => current().field.onChange("Typed, not yet saved."));

    let switched: Promise<boolean> = Promise.resolve(false);
    act(() => {
      switched = current().activate(methodsOfSecond);
    });
    // Saved at once, not after the one-second debounce.
    expect(save.calls).toEqual([
      [first.file.frontmatter.id, "methods", "Typed, not yet saved."],
    ]);
    expect(current().target).toEqual(methodsOfFirst);

    await save.finish();
    await act(async () => {
      expect(await switched).toBe(true);
    });
    expect(current().target).toEqual(methodsOfSecond);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(save.calls).toHaveLength(1);
  });

  it("stays on the section, showing the error, when its save fails", async () => {
    const save = manualSave();
    mount(save);
    act(() => void current().activate(methodsOfFirst));
    act(() => current().field.onChange("Typed."));
    let switched: Promise<boolean> = Promise.resolve(true);
    act(() => {
      switched = current().activate(notesOfFirst);
    });
    await save.finish({ ok: false, message: "Disk full" });
    await act(async () => {
      expect(await switched).toBe(false);
    });
    expect(current().target).toEqual(methodsOfFirst);
    expect(current().field.status).toBe("error");
    expect(current().field.text).toBe("Typed.");
  });

  it("still switches when forced, as a new selection is, after trying the save", async () => {
    const save = manualSave();
    mount(save);
    act(() => void current().activate(methodsOfFirst));
    act(() => current().field.onChange("Typed."));
    let switched: Promise<boolean> = Promise.resolve(false);
    act(() => {
      switched = current().activate(methodsOfSecond, { force: true });
    });
    await save.finish({ ok: false, message: "Disk full" });
    await act(async () => {
      expect(await switched).toBe(true);
    });
    expect(current().target).toEqual(methodsOfSecond);
  });

  it("opens the latest section asked for when several are asked for during one save", async () => {
    const save = manualSave();
    mount(save);
    act(() => void current().activate(methodsOfFirst));
    act(() => current().field.onChange("Typed."));
    let firstAsk: Promise<boolean> = Promise.resolve(true);
    let secondAsk: Promise<boolean> = Promise.resolve(false);
    act(() => {
      firstAsk = current().activate(notesOfFirst);
      secondAsk = current().activate(methodsOfSecond);
    });
    await save.finish();
    await act(async () => {
      expect(await firstAsk).toBe(false);
      expect(await secondAsk).toBe(true);
    });
    expect(current().target).toEqual(methodsOfSecond);
  });

  it("has no live section once its experiment is deleted or becomes read-only", () => {
    const save = manualSave();
    mount(save);
    act(() => void current().activate(methodsOfFirst));
    rerender(save, arrangedWith(true));
    expect(current().target).toBeNull();
    rerender(save, arrangedWith(false, false));
    expect(current().target).toBeNull();
  });

  it("never opens a read-only experiment's section", () => {
    const save = manualSave();
    mount(save, arrangedWith(true));
    act(() => void current().activate(methodsOfFirst));
    expect(current().target).toBeNull();
  });
});
