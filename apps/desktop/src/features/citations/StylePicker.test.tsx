import {
  AUTHOR_DATE_STYLE,
  NUMERIC_STYLE,
  renderLiterature,
} from "@research-notebook/citations";
import {
  newProject,
  type CitationStyleChange,
  type NotebookState,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StylePicker } from "./StylePicker";
import { useStyleManagement } from "./useStyleManagement";

/** S5-G08 from the person's side: a note style is refused with a message, and nothing is saved. */

const ok = (data: unknown) => ({ status: "ok", data });

/** Lets every pending promise settle inside `act`, so state updates are applied. */
const flush = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function openState(): NotebookState {
  const created = newProject(
    { name: "P", appVersion: "0.2.0" },
    {
      now: () => new Date("2026-10-02T10:00:00Z"),
      newId: () => "01JAXP0000000000000000000A",
    },
  );
  if (!created.ok) throw new Error("project");
  return {
    project: created.value.project,
    questions: [],
    experiments: [],
    reservedRefs: [],
    unreadable: [],
  };
}

function Harness(props: {
  writable: boolean;
  apply: (change: CitationStyleChange) => Promise<boolean>;
  api: { readNotebookFile: ReturnType<typeof vi.fn> };
}) {
  const model = useStyleManagement({
    folder: 7,
    state: openState(),
    writable: props.writable,
    apply: props.apply,
    api: props.api as never,
    render: (input) => Promise.resolve(renderLiterature(input)),
  });
  return <StylePicker model={model} />;
}

async function show(writable = true) {
  const apply = vi.fn(() => Promise.resolve(true));
  const api = {
    readNotebookFile: vi.fn(() => Promise.resolve(ok({ kind: "missing" }))),
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(<Harness writable={writable} apply={apply} api={api} />),
  );
  await flush();
  return { apply, api, container };
}

async function pick(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
}

describe("StylePicker", () => {
  it("lists the bundled styles and says when the named file is not in styles/", async () => {
    const { container: view } = await show();
    const options = [...view.querySelectorAll("option")].map(
      (o) => o.textContent,
    );
    expect(options).toContain("Notebook numeric");
    expect(options).toContain("Notebook author-date");
    expect(options.some((o) => o?.includes("nature.csl (current)"))).toBe(true);
    expect(view.textContent).toContain("until one is chosen");
  });

  it("refuses an imported note style with an explanation and saves nothing", async () => {
    const { apply, container: view } = await show();
    const note = NUMERIC_STYLE.replace('class="in-text"', 'class="note"');
    const input = view.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error("no file input");
    await pick(input, new File([note], "footnotes.csl"));
    expect(view.querySelector('[role="status"]')?.textContent).toContain(
      "note style",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("imports a valid style and saves it as one change", async () => {
    const { apply, container: view } = await show();
    const input = view.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error("no file input");
    await pick(input, new File([AUTHOR_DATE_STYLE], "Journal Style.csl"));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ file: "journal-style.csl" }),
    );
    expect(view.querySelector('[role="status"]')?.textContent).toContain(
      "Citation style changed",
    );
  });

  it("choosing a bundled style saves it", async () => {
    const { apply, container: view } = await show();
    const select = view.querySelector("select");
    if (select === null) throw new Error("no select");
    act(() => {
      select.value = "author-date.csl";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ file: "author-date.csl" }),
    );
  });

  it("is disabled in a read-only project", async () => {
    const { container: view } = await show(false);
    expect(view.querySelector("select")?.disabled).toBe(true);
    expect(view.querySelector<HTMLInputElement>("input")?.disabled).toBe(true);
  });
});
