import {
  serialiseBibliography,
  type BibliographyFileModel,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../shared/sha256";
import { SourcesPanel } from "./SourcesPanel";
import { SourcesProvider, useSourceSync, useSources } from "./SourcesContext";
import type { SourcesApi } from "./model/syncSources";

const NOW = () => new Date("2026-10-02T10:00:00Z");
const ok = (data: unknown) => ({ status: "ok", data });
const failure = (kind: string) => ({ status: "error", error: { kind } });

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

function held(
  key: string,
  title: string,
  status: "ok" | "trashed" | "missing" = "ok",
  serverId: string | null = "srv-1",
): BibliographyFileModel[number] {
  return {
    id: `z:u:${key}`,
    type: "book",
    title,
    _zotero: {
      server_id: serverId,
      library: "u",
      key,
      fetched: "2026-09-01T00:00:00Z",
      status,
    },
  };
}

function fakeApi(
  file: BibliographyFileModel,
  zotero: Record<string, unknown> = {},
) {
  let text = serialiseBibliography(file);
  const api = {
    zoteroFetchSource: vi.fn((key: string) =>
      Promise.resolve(zotero[key] ?? failure("requestFailed")),
    ),
    readNotebookFile: vi.fn(() =>
      Promise.resolve(ok({ kind: "text", text, sha256: sha256Hex(text) })),
    ),
    writeNotebookFile: vi.fn((_f: number, _p: string, next: string) => {
      text = next;
      return Promise.resolve(ok({ kind: "saved", snapshot: null }));
    }),
  };
  return { api: api as unknown as SourcesApi, fake: api };
}

const found = (title: string, serverId: string | null = "srv-1") =>
  ok({
    kind: "found",
    cslJson: JSON.stringify({ type: "book", title }),
    serverId,
    trashed: false,
  });

async function mount(
  api: SourcesApi,
  options: { writable?: boolean; extra?: React.ReactNode } = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SourcesProvider
        api={api}
        folder={1}
        writable={options.writable ?? true}
        now={NOW}
      >
        <SourcesPanel />
        {options.extra}
      </SourcesProvider>,
    ),
  );
  await flush();
  return container;
}

const button = (view: HTMLElement, name: RegExp) => {
  const match = [...view.querySelectorAll("button")].find((b) =>
    name.test(b.textContent ?? ""),
  );
  if (match === undefined) throw new Error(`no button ${String(name)}`);
  return match;
};

async function click(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

describe("SourcesPanel: states (FR-CIT-07)", () => {
  it("lists each source with its ok, trashed or missing state", async () => {
    const { api } = fakeApi([
      held("AAAA2222", "Fine"),
      held("BBBB3333", "Binned", "trashed"),
      held("CCCC4444", "Gone", "missing"),
    ]);
    const view = await mount(api);
    const items = [...view.querySelectorAll("li")].map((li) => li.textContent);
    expect(items[0]).toMatch(/Fine.*In Zotero/);
    expect(items[1]).toMatch(/Binned.*trash/i);
    expect(items[2]).toMatch(/Gone.*missing/i);
  });

  it("shows an empty message when nothing is cited yet", async () => {
    const { api } = fakeApi([]);
    const view = await mount(api);
    expect(view.textContent).toMatch(/No sources/);
  });
});

describe("SourcesPanel: refresh", () => {
  it("refreshes every held source and reports it", async () => {
    const { api, fake } = fakeApi([held("AAAA2222", "Old")], {
      AAAA2222: found("New"),
    });
    const view = await mount(api);
    await click(button(view, /refresh/i));
    expect(fake.zoteroFetchSource).toHaveBeenCalledWith("AAAA2222");
    expect(fake.writeNotebookFile).toHaveBeenCalledTimes(1);
    expect(view.textContent).toMatch(/New/);
    expect(view.querySelector('[role="status"]')?.textContent).toMatch(
      /1 updated/,
    );
  });

  it("is disabled in a read-only project", async () => {
    const { api } = fakeApi([held("AAAA2222", "Old")]);
    const view = await mount(api, { writable: false });
    expect(button(view, /refresh/i).disabled).toBe(true);
  });

  it("says Zotero is not running and changes nothing", async () => {
    const { api, fake } = fakeApi([held("AAAA2222", "Old")], {
      AAAA2222: failure("notRunning"),
    });
    const view = await mount(api);
    await click(button(view, /refresh/i));
    expect(view.querySelector('[role="status"]')?.textContent).toMatch(
      /not detected/,
    );
    expect(fake.writeNotebookFile).not.toHaveBeenCalled();
    expect(view.textContent).toMatch(/Old/);
  });
});

describe("SourcesPanel: server id mismatch prompt (FR-CIT-07)", () => {
  const setup = () =>
    fakeApi([held("AAAA2222", "Mine", "ok", "srv-1")], {
      AAAA2222: found("Theirs", "srv-2"),
    });

  it("asks before overwriting and has written nothing yet", async () => {
    const { api, fake } = setup();
    const view = await mount(api);
    await click(button(view, /refresh/i));
    expect(view.querySelector('[role="alertdialog"]')?.textContent).toMatch(
      /different Zotero/,
    );
    expect(fake.writeNotebookFile).not.toHaveBeenCalled();
    expect(view.textContent).toMatch(/Mine/);
  });

  it("overwrites once the person agrees", async () => {
    const { api, fake } = setup();
    const view = await mount(api);
    await click(button(view, /refresh/i));
    await click(button(view, /replace/i));
    expect(fake.writeNotebookFile).toHaveBeenCalledTimes(1);
    expect(view.querySelector('[role="alertdialog"]')).toBeNull();
    expect(view.textContent).toMatch(/Theirs/);
  });

  it("keeps the existing data when the person declines", async () => {
    const { api, fake } = setup();
    const view = await mount(api);
    await click(button(view, /refresh/i));
    await click(button(view, /keep/i));
    expect(fake.writeNotebookFile).not.toHaveBeenCalled();
    expect(view.querySelector('[role="alertdialog"]')).toBeNull();
    expect(view.textContent).toMatch(/Mine/);
  });
});

describe("useSourceSync: after a citation is inserted (FR-CIT-05)", () => {
  function Inserter() {
    const sync = useSourceSync();
    return (
      <button type="button" onClick={() => sync(["z:u:AAAA2222"])}>
        insert
      </button>
    );
  }

  it("adds the cited source to bibliography.json", async () => {
    const { api, fake } = fakeApi([], { AAAA2222: found("Cited") });
    const view = await mount(api, { extra: <Inserter /> });
    await click(button(view, /^insert$/));
    expect(fake.writeNotebookFile).toHaveBeenCalledTimes(1);
    expect(view.textContent).toMatch(/Cited/);
  });
});

describe("SourcesPanel: opening a source (FR-CIT-04)", () => {
  it("selects the source whose label is activated", async () => {
    const { api } = fakeApi([held("AAAA2222", "Fine")]);
    function Probe() {
      return <output>{useSources().selected ?? "none"}</output>;
    }
    const view = await mount(api, { extra: <Probe /> });
    expect(view.querySelector("output")?.textContent).toBe("none");
    await click(button(view, /Fine/));
    expect(view.querySelector("output")?.textContent).toBe("z:u:AAAA2222");
  });
});
