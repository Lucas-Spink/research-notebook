import { parseCanvas } from "@research-notebook/format";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CanvasView } from "./CanvasView";
import { A, B, FOLDER, fakeApi, pathOf, textOf } from "./model/fakeApi";
import { connectNodes, addNote, setNoteText } from "./model/notes";
import { pinResults } from "./model/nodes";
import { serialiseCanvasText } from "./testCanvas";
import type { CanvasApi } from "./model/store";
import {
  buttonNamed,
  click,
  fakeCards,
  flush,
  foundResult,
  mount,
  stubFlowEnvironment,
  type,
  unmount,
} from "./testSupport";
import { useCanvases } from "./useCanvases";

/**
 * ADR-0065, the canvas view: a tab for each question, that question's canvas
 * in the middle with notes and figures, and a summary of the notes beside it.
 */

beforeAll(stubFlowEnvironment);
afterEach(unmount);

const EXP = "01JAXE000000000000000000A1";
const ART = "01JAXA000000000000000000A1";

const TABS = [
  { key: "Q-001.md", label: "Q-001 First", id: A },
  { key: "Q-002.md", label: "Q-002 Second", id: B },
];

function Harness({
  api,
  cards,
  writable = true,
  initial = "Q-001.md",
  onChoose = () => undefined,
  questions = TABS,
}: {
  api: CanvasApi;
  cards: ReturnType<typeof fakeCards>;
  writable?: boolean;
  initial?: string | null;
  onChoose?: (key: string) => void;
  questions?: typeof TABS;
}) {
  const tab = questions.find((t) => t.key === initial);
  const canvases = useCanvases({
    api,
    folder: FOLDER,
    writable,
    enabled: true,
    question: tab === undefined ? null : { id: tab.id, name: tab.label },
    saveDelayMs: 0,
  });
  return (
    <CanvasView
      canvases={canvases}
      cards={cards}
      questions={questions}
      question={initial}
      onChooseQuestion={onChoose}
    />
  );
}

async function open(
  files: Record<string, string> = {},
  options: {
    writable?: boolean;
    initial?: string | null;
    questions?: typeof TABS;
    onChoose?: (key: string) => void;
  } = {},
) {
  const fake = fakeApi(files);
  const cards = fakeCards({ [ART]: foundResult() });
  const view = mount(<Harness api={fake.api} cards={cards} {...options} />);
  await flush();
  return { view, cards, ...fake };
}

const saved = (disk: Record<string, string>, id = A) => {
  const parsed = parseCanvas(disk[pathOf(id)] ?? "");
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
};

const panel = (view: HTMLElement, heading: string) => {
  const found = [...view.querySelectorAll("aside")].find(
    (a) => a.querySelector("h3")?.textContent === heading,
  );
  if (found === undefined) throw new Error(`no ${heading} panel`);
  return found;
};

describe("the canvas view", () => {
  it("has results on the left, the question's canvas in the middle and its notes on the right", async () => {
    const { view } = await open();
    expect(
      [...view.querySelectorAll("aside h3")].map((h) => h.textContent),
    ).toEqual(["Results", "Notes"]);
    expect(
      view.querySelector('[role="region"][aria-label="Canvas"]'),
    ).not.toBeNull();
    expect(view.textContent).toContain("Zoom: 100%");
  });

  it("has a tab for each question, the one shown selected, and asks for another when one is chosen", async () => {
    const chosen: string[] = [];
    const { view } = await open({}, { onChoose: (k) => chosen.push(k) });
    const tabs = [...view.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Q-001 First",
      "Q-002 Second",
    ]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
    ]);
    click(tabs[1]);
    expect(chosen).toEqual(["Q-002.md"]);
  });

  it("moves between question tabs with the arrow keys", async () => {
    const chosen: string[] = [];
    const { view } = await open({}, { onChoose: (k) => chosen.push(k) });
    await act(async () => {
      view
        .querySelector('[role="tab"]')
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        );
      await Promise.resolve();
    });
    expect(chosen).toEqual(["Q-002.md"]);
  });

  it("says so, with no canvas, when the project has no questions", async () => {
    const { view } = await open({}, { questions: [], initial: null });
    expect(view.textContent).toContain("no questions yet");
    expect(
      view.querySelector('[role="region"][aria-label="Canvas"]'),
    ).toBeNull();
    expect(buttonNamed(view, "Add note").disabled).toBe(true);
  });

  it("shows another question's own canvas, not this one's", async () => {
    const withNote = serialiseCanvasText(B, "Second", (file) =>
      setNoteText(
        addNote(file, { x: 0, y: 0 }, () => "01JAXN00000000000000000001"),
        "01JAXN00000000000000000001",
        "belongs to Q-002",
      ),
    );
    const { view } = await open({ [pathOf(B)]: withNote });
    expect(panel(view, "Notes").textContent).not.toContain("belongs to Q-002");
  });

  it("explains a canvas file that cannot be read, leaves it alone, and offers no notes", async () => {
    const { view, disk } = await open({ [pathOf(A)]: "{ not json" });
    expect(view.textContent).toContain("could not be read");
    expect(buttonNamed(view, "Add note").disabled).toBe(true);
    expect(disk[pathOf(A)]).toBe("{ not json");
  });

  it("is read-only when the project is: it can be looked at, not changed", async () => {
    const { view, writes } = await open({}, { writable: false });
    expect(view.textContent).toContain("read-only");
    expect(buttonNamed(view, "Add note").disabled).toBe(true);
    expect(writes).toEqual([]);
  });
});

describe("notes", () => {
  it("adds an empty note that makes the canvas file, and lists it in the summary", async () => {
    const { view, disk, writes } = await open();
    expect(writes).toEqual([]);
    click(buttonNamed(view, "Add note"));
    await flush();
    expect(view.querySelectorAll(".canvas-note")).toHaveLength(1);
    expect(saved(disk).nodes).toHaveLength(1);
    expect(saved(disk).nodes[0]).toMatchObject({ type: "note", text: "" });
    expect(panel(view, "Notes").textContent).toContain("Empty note");
  });

  it("saves what is typed in a note and shows it in the summary", async () => {
    const { view, disk } = await open();
    click(buttonNamed(view, "Add note"));
    await flush();
    const box = view.querySelector("textarea");
    if (box === null) throw new Error("no note");
    type(box, "Why is the dotplot flat?");
    await flush();
    expect(saved(disk).nodes[0]).toMatchObject({
      text: "Why is the dotplot flat?",
    });
    expect(panel(view, "Notes").textContent).toContain(
      "Why is the dotplot flat?",
    );
  });

  it("removes a note from its right-click menu, and its lines with it", async () => {
    const { view, disk } = await open();
    click(buttonNamed(view, "Add note"));
    await flush();
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
    act(() => {
      view
        .querySelector(".canvas-note")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    click(document.querySelector('[role="menuitem"]'));
    await flush();
    expect(saved(disk).nodes).toEqual([]);
    expect(view.querySelector(".canvas-note")).toBeNull();
  });

  it("has no way to write in or remove a note when the project is read-only", async () => {
    const file = serialiseCanvasText(A, "First", (f) =>
      setNoteText(
        addNote(f, { x: 0, y: 0 }, () => "01JAXN00000000000000000001"),
        "01JAXN00000000000000000001",
        "kept",
      ),
    );
    const { view } = await open({ [pathOf(A)]: file }, { writable: false });
    expect(view.querySelector("textarea")?.hasAttribute("readonly")).toBe(true);
    act(() => {
      view
        .querySelector(".canvas-note")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
  });
});

describe("lines and the summary", () => {
  const joined = () => {
    let file = addNote(
      { ...parsedEmpty(), nodes: [] },
      { x: 100, y: 100 },
      () => "01JAXN00000000000000000001",
    );
    file = setNoteText(file, "01JAXN00000000000000000001", "Flat dotplot");
    file = pinResults(
      file,
      [{ experimentId: EXP, artefactId: ART, version: 1 }],
      { x: 600, y: 100 },
      () => "01JAXN00000000000000000002",
    );
    file = connectNodes(
      file,
      "01JAXN00000000000000000001",
      "01JAXN00000000000000000002",
      () => "01JAXD00000000000000000001",
    );
    return file;
  };

  it("draws a line between a note and a figure and lists the figure under the note", async () => {
    const { view } = await open({
      [pathOf(A)]: serialiseCanvasText(A, "First", () => joined()),
    });
    const summary = panel(view, "Notes").textContent ?? "";
    expect(summary).toContain("Flat dotplot");
    expect(summary).toContain("Refers to");
    expect(summary).toContain("PCA plot (EXP-001, v1)");
  });

  it("selects a note's card when its entry in the summary is chosen", async () => {
    const { view } = await open({
      [pathOf(A)]: serialiseCanvasText(A, "First", () => joined()),
    });
    const entry = panel(view, "Notes").querySelector(
      "button.canvas-summary__select",
    );
    click(entry);
    await flush();
    const noteCard = view.querySelector(".react-flow__node-note");
    expect(noteCard?.classList.contains("selected")).toBe(true);
  });

  it("drops a line when its card is removed", async () => {
    const { view, disk } = await open({
      [pathOf(A)]: serialiseCanvasText(A, "First", () => joined()),
    });
    click(view.querySelector('button[aria-label="Remove from canvas"]'));
    await flush();
    expect(saved(disk).edges).toEqual([]);
    expect(panel(view, "Notes").textContent).not.toContain("Refers to");
  });
});

describe("the side panels", () => {
  it("hide and show with their buttons, giving the canvas the room", async () => {
    const { view } = await open();
    click(buttonNamed(view, "Hide results"));
    expect(view.querySelectorAll("aside")).toHaveLength(1);
    click(buttonNamed(view, "Hide notes"));
    expect(view.querySelectorAll("aside")).toHaveLength(0);
    click(buttonNamed(view, "Show results"));
    click(buttonNamed(view, "Show notes"));
    expect(view.querySelectorAll("aside")).toHaveLength(2);
  });

  it("resize from the keyboard, within their limits", async () => {
    const { view } = await open();
    const results = view.querySelector(
      '[role="separator"][aria-label="Resize the results panel"]',
    );
    const before = Number(results?.getAttribute("aria-valuenow"));
    results?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await flush();
    expect(
      Number(
        view
          .querySelector(
            '[role="separator"][aria-label="Resize the results panel"]',
          )
          ?.getAttribute("aria-valuenow"),
      ),
    ).toBe(before + 16);
  });

  it("show what the rest of the application gives the results panel", async () => {
    const fake = fakeApi({});
    const cards = fakeCards();
    const spy = vi.fn();
    function WithPanel() {
      const canvases = useCanvases({
        api: fake.api,
        folder: FOLDER,
        writable: true,
        enabled: true,
        question: { id: A, name: "Q" },
      });
      spy();
      return (
        <CanvasView
          canvases={canvases}
          cards={cards}
          questions={TABS}
          question="Q-001.md"
          onChooseQuestion={() => undefined}
          resultsPanel={<p>tree goes here</p>}
        />
      );
    }
    const view = mount(<WithPanel />);
    await flush();
    expect(view.textContent).toContain("tree goes here");
    expect(view.textContent).not.toContain("will be listed here");
  });
});

function parsedEmpty() {
  const parsed = parseCanvas(textOf(A, "First"));
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
}

describe("the note menu", () => {
  it("has no button on the note itself and closes without deleting", async () => {
    const { view, disk } = await open();
    click(buttonNamed(view, "Add note"));
    await flush();
    expect(view.querySelector("button[aria-label='Delete note']")).toBeNull();
    act(() => {
      view
        .querySelector(".canvas-note")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(document.querySelector('[role="menuitem"]')).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
    expect(saved(disk).nodes).toHaveLength(1);
  });
});
