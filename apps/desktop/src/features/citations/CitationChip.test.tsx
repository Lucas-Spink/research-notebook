import {
  serialiseBibliography,
  type BibliographyFileModel,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../shared/sha256";
import { CitationChip } from "./CitationChip";
import {
  CitationActionsProvider,
  type CitationActions,
} from "./CitationInteraction";
import { SourcesProvider } from "./SourcesContext";
import type { SourcesApi } from "./model/syncSources";

/**
 * S6-T01: a citation is an interactive reference: its label in brackets,
 * the full reference on hover, the side pane on a click, and the
 * Bibliography on a double click.
 */

const bibliography: BibliographyFileModel = [
  {
    id: "z:u:AAAA2222",
    type: "article-journal",
    title: "Batch effects in organoids",
    author: [{ given: "Ada", family: "Smith" }],
    issued: { "date-parts": [[2024]] },
    "container-title": "Nature Methods",
    _zotero: {
      server_id: null,
      library: "u",
      key: "AAAA2222",
      fetched: "2026-10-01T09:00:00Z",
      status: "ok",
    },
  },
  {
    id: "z:u:BBBB3333",
    type: "book",
    title: "Second",
    author: [{ family: "Jones" }],
    issued: { "date-parts": [[2023]] },
    _zotero: {
      server_id: null,
      library: "u",
      key: "BBBB3333",
      fetched: "2026-10-01T09:00:00Z",
      status: "trashed",
    },
  },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.body
    .querySelectorAll(".citation-preview")
    .forEach((n) => n.remove());
  root = null;
  container = null;
});

async function mount(
  chip: React.ReactNode,
  actions: CitationActions = { open: () => undefined, jump: () => undefined },
  onOuterClick: () => void = () => undefined,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const text = serialiseBibliography(bibliography);
  const api = {
    readNotebookFile: () =>
      Promise.resolve({
        status: "ok",
        data: { kind: "text", text, sha256: sha256Hex(text) },
      }),
  } as unknown as SourcesApi;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SourcesProvider api={api} folder={1} writable>
        <CitationActionsProvider value={actions}>
          <div onClick={onOuterClick}>{chip}</div>
        </CitationActionsProvider>
      </SourcesProvider>,
    ),
  );
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  return container;
}

const fire = (element: Element | null | undefined, type: string) =>
  act(() => {
    element?.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  });

describe("CitationChip (S6-T01)", () => {
  it("reads as [Smith 2024], with prefix and locator kept as written", async () => {
    const view = await mount(
      <CitationChip
        items={[
          { citekey: "z:u:AAAA2222", prefix: "see ", suffix: "p. 3" },
          { citekey: "z:u:BBBB3333", prefix: " " },
        ]}
      />,
    );
    expect(view.querySelector(".citation-chip")?.textContent).toBe(
      "[see Smith 2024, p. 3;  Jones 2023]",
    );
  });

  it("reads an author-in-text citation without brackets, with its locator", async () => {
    const view = await mount(
      <CitationChip
        inText
        items={[{ citekey: "z:u:AAAA2222", suffix: "p. 4" }]}
      />,
    );
    expect(view.querySelector(".citation-chip")?.textContent).toBe(
      "Smith 2024 [p. 4]",
    );
  });

  it("shows the full reference and key metadata on hover, and hides it after", async () => {
    try {
      const view = await mount(
        <CitationChip items={[{ citekey: "z:u:AAAA2222" }]} />,
      );
      vi.useFakeTimers();
      fire(view.querySelector("button"), "mouseover");
      const preview = document.body.querySelector(".citation-preview");
      expect(preview?.textContent).toContain(
        "Ada Smith (2024). Batch effects in organoids. Nature Methods.",
      );
      expect(preview?.textContent).toContain("Published in");

      fire(view.querySelector("button"), "mouseout");
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(document.body.querySelector(".citation-preview")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says when a source is in the Zotero trash", async () => {
    const view = await mount(
      <CitationChip items={[{ citekey: "z:u:BBBB3333" }]} />,
    );
    fire(view.querySelector("button"), "mouseover");
    expect(
      document.body.querySelector(".citation-preview")?.textContent,
    ).toContain("trash");
  });

  it("shows a source that is not cached by its citekey, and says so on hover", async () => {
    const view = await mount(
      <CitationChip items={[{ citekey: "z:u:GONE9999" }]} />,
    );
    expect(view.querySelector("button")?.textContent).toBe("@z:u:GONE9999");
    fire(view.querySelector("button"), "mouseover");
    expect(
      document.body.querySelector(".citation-preview")?.textContent,
    ).toContain("not in this project's bibliography.json");
  });

  it("opens the clicked source in the side pane, without clicking what encloses it", async () => {
    const actions = { open: vi.fn(), jump: vi.fn() };
    const outer = vi.fn();
    const view = await mount(
      <CitationChip
        items={[{ citekey: "z:u:AAAA2222" }, { citekey: "z:u:BBBB3333" }]}
      />,
      actions,
      outer,
    );
    vi.useFakeTimers();
    try {
      fire(view.querySelectorAll("button")[1], "click");
      // It waits briefly in case a second click makes it a double click.
      expect(actions.open).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(actions.open).toHaveBeenCalledWith("z:u:BBBB3333");
      expect(actions.jump).not.toHaveBeenCalled();
      expect(outer).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("goes to the source's Bibliography entry on a double click, and does not also open the pane", async () => {
    const actions = { open: vi.fn(), jump: vi.fn() };
    const view = await mount(
      <CitationChip items={[{ citekey: "z:u:AAAA2222" }]} />,
      actions,
    );
    vi.useFakeTimers();
    try {
      const chip = view.querySelector("button");
      fire(chip, "click");
      fire(chip, "click");
      fire(chip, "dblclick");
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(actions.jump).toHaveBeenCalledTimes(1);
      expect(actions.jump).toHaveBeenCalledWith("z:u:AAAA2222");
      expect(actions.open).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
