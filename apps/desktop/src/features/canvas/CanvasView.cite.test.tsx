import { parseCanvas } from "@research-notebook/format";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CanvasView } from "./CanvasView";
import { A, FOLDER, fakeApi, pathOf } from "./model/fakeApi";
import {
  buttonNamed,
  click,
  fakeCards,
  flush,
  mount,
  stubFlowEnvironment,
  type,
  unmount,
} from "./testSupport";
import { useCanvases } from "./useCanvases";

// The real picker reads the library; what matters here is where its answer goes.
vi.mock("./NoteCitationPicker", () => ({
  NoteCitationPicker: ({
    onInsert,
    onCancel,
  }: {
    onInsert: (markdown: string) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="picker">
      <button type="button" onClick={() => onInsert("[@z:u:7XK2PQ9M]")}>
        Pick
      </button>
      <button type="button" onClick={onCancel}>
        Close picker
      </button>
    </div>
  ),
}));

beforeAll(stubFlowEnvironment);
afterEach(unmount);

const TABS = [{ key: "Q-001.md", label: "Q-001 First", id: A }];

function Harness({ api }: { api: ReturnType<typeof fakeApi>["api"] }) {
  const canvases = useCanvases({
    api,
    folder: FOLDER,
    writable: true,
    enabled: true,
    question: { id: A, name: "Q-001 First" },
    saveDelayMs: 0,
  });
  return (
    <CanvasView
      canvases={canvases}
      cards={fakeCards({})}
      questions={TABS}
      question="Q-001.md"
      onChooseQuestion={() => undefined}
    />
  );
}

async function openNote() {
  const fake = fakeApi({});
  const view = mount(<Harness api={fake.api} />);
  await flush();
  click(buttonNamed(view, "Add note"));
  await flush();
  const box = view.querySelector("textarea");
  if (box === null) throw new Error("no note");
  return { view, box, disk: fake.disk };
}

const savedText = (disk: Record<string, string>) => {
  const parsed = parseCanvas(disk[pathOf(A)] ?? "");
  if (!parsed.ok) throw new Error(parsed.error.message);
  const note = parsed.value.nodes.find((n) => n.type === "note");
  return note?.type === "note" ? note.text : null;
};

describe("/cite in a note", () => {
  it("opens the picker and takes the typed command out of the note", async () => {
    const { view, box } = await openNote();
    type(box, "As shown by /cite");
    await flush();
    expect(view.querySelector('[data-testid="picker"]')).not.toBeNull();
    expect(box.value).toBe("As shown by ");
  });

  it("puts the chosen citation where the command was, and saves it", async () => {
    const { view, box, disk } = await openNote();
    type(box, "As shown by /cite");
    await flush();
    click(buttonNamed(view, "Pick"));
    await flush();
    expect(view.querySelector('[data-testid="picker"]')).toBeNull();
    expect(box.value).toBe("As shown by [@z:u:7XK2PQ9M]");
    expect(savedText(disk)).toBe("As shown by [@z:u:7XK2PQ9M]");
  });

  it("leaves the note as it was when the picker is closed", async () => {
    const { view, box, disk } = await openNote();
    type(box, "Unsure /cite");
    await flush();
    click(buttonNamed(view, "Close picker"));
    await flush();
    expect(view.querySelector('[data-testid="picker"]')).toBeNull();
    expect(savedText(disk)).toBe("Unsure ");
  });

  it("does not open for a word that only ends in /cite", async () => {
    const { view, box } = await openNote();
    type(box, "a/cite");
    await flush();
    expect(view.querySelector('[data-testid="picker"]')).toBeNull();
    expect(box.value).toBe("a/cite");
  });
});
