import {
  createExperiment,
  createQuestion,
  editExperimentSection,
  newProject,
  serialiseBibliography,
  type BibliographyFileModel,
  type NotebookEnv,
  type NotebookState,
  type SourceReplacement,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../shared/sha256";
import type { RepairEnv } from "./model/sourceRepair";
import { SourcesProvider } from "./SourcesContext";
import { SourcesPanel } from "./SourcesPanel";
import { useSourceRepair } from "./useSourceRepair";

/** FR-CIT-08 (S5-G06): missing and trashed sources stay visible and can be replaced; others cannot. */

const OLD = "z:u:OLDD2222";
const NEW = "z:u:NEWW3333";
const NOW = () => new Date("2026-10-02T10:00:00Z");
const ENV: NotebookEnv = {
  now: NOW,
  newId: (() => {
    let n = 0;
    return () => `01JAX${String((n += 1)).padStart(21, "0")}`;
  })(),
  appVersion: "0.2.0",
};
const ok = (data: unknown) => ({ status: "ok", data });
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
  citekey: string,
  title: string,
  status: "ok" | "trashed" | "missing",
): BibliographyFileModel[number] {
  const [, library = "u", key = ""] = citekey.split(":");
  return {
    id: citekey,
    type: "book",
    title,
    _zotero: {
      server_id: "srv-1",
      library,
      key,
      fetched: "2026-09-01T00:00:00Z",
      status,
    },
  };
}

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

function projectCiting(citekey: string): NotebookState {
  let state: NotebookState = {
    project: must(
      newProject(
        { name: "P", appVersion: "0.2.0" },
        { now: NOW, newId: () => "01JAXP0000000000000000000A" },
      ),
    ).project,
    questions: [],
    experiments: [],
    reservedRefs: [],
    unreadable: [],
  };
  state = must(createQuestion(state, { title: "Q" }, ENV)).next;
  const questionId = state.questions[0]?.file.frontmatter.id ?? "";
  state = must(createExperiment(state, { questionId, title: "One" }, ENV)).next;
  const id = state.experiments[0]?.file.frontmatter.id ?? "";
  return must(
    editExperimentSection(state, id, "methods", `Seen [@${citekey}].`, ENV),
  ).next;
}

function commandsFor(file: BibliographyFileModel) {
  let text = serialiseBibliography(file);
  return {
    zoteroFetchSource: vi.fn(() =>
      Promise.resolve(
        ok({
          kind: "found",
          cslJson: JSON.stringify({ type: "book", title: "New" }),
          serverId: "srv-1",
          trashed: false,
        }),
      ),
    ),
    readNotebookFile: vi.fn((_f: number, path: string) =>
      Promise.resolve(
        path.endsWith("bibliography.json")
          ? ok({ kind: "text", text, sha256: sha256Hex(text) })
          : ok({ kind: "missing" }),
      ),
    ),
    writeNotebookFile: vi.fn((_f: number, _p: string, next: string) => {
      text = next;
      return Promise.resolve(ok({ kind: "saved", snapshot: null }));
    }),
  };
}

function Harness({
  api,
  state,
  apply,
  writable = true,
  pick,
}: {
  api: RepairEnv["api"];
  state: NotebookState;
  apply: (change: SourceReplacement) => Promise<boolean>;
  writable?: boolean;
  pick?: string;
}) {
  const repair = useSourceRepair({
    folder: 1,
    state,
    writable,
    apply,
    api,
    render: () => Promise.reject(new Error("no render")),
    now: NOW,
  });
  return (
    <>
      <SourcesPanel repair={repair} />
      {pick !== undefined && repair.choosing !== null && (
        <button type="button" onClick={() => repair.choose(pick)}>
          pick-replacement
        </button>
      )}
    </>
  );
}

async function mount(
  file: BibliographyFileModel,
  options: { writable?: boolean; apply?: SourceReplacement[] } = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const fake = commandsFor(file);
  const api = fake as unknown as RepairEnv["api"];
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
        <Harness
          api={api}
          state={projectCiting(OLD)}
          writable={options.writable ?? true}
          pick={NEW}
          apply={(change) => {
            options.apply?.push(change);
            return Promise.resolve(true);
          }}
        />
      </SourcesProvider>,
    ),
  );
  await flush();
  return { view: container, fake };
}

const replaceButtons = (view: HTMLElement) =>
  [...view.querySelectorAll("button")].filter((b) =>
    /^Replace…/.test(b.textContent ?? ""),
  );

describe("source repair in the Sources list", () => {
  it("shows every state and offers Replace only for missing and trashed sources", async () => {
    const { view } = await mount([
      held(OLD, "Old", "missing"),
      held("z:u:TRSH2222", "Gone", "trashed"),
      held("z:u:FINE2222", "Fine", "ok"),
    ]);
    const items = [...view.querySelectorAll("li[data-status]")];
    expect(items.map((li) => li.getAttribute("data-status"))).toEqual([
      "missing",
      "trashed",
      "ok",
    ]);
    expect(items[0]?.textContent).toMatch(/Missing from Zotero/);
    expect(items[1]?.textContent).toMatch(/Zotero trash/);
    expect(replaceButtons(view)).toHaveLength(2);
    expect(items[2]?.textContent).not.toMatch(/Replace/);
  });

  it("offers no Replace in a read-only project", async () => {
    const { view } = await mount([held(OLD, "Old", "missing")], {
      writable: false,
    });
    expect(replaceButtons(view)).toHaveLength(0);
  });

  it("opens the picker for the source and replaces it", async () => {
    const applied: SourceReplacement[] = [];
    const { view, fake } = await mount([held(OLD, "Old", "missing")], {
      apply: applied,
    });
    act(() => replaceButtons(view)[0]?.click());
    expect(
      view.querySelector('[role="dialog"][aria-label*="Replace source"]'),
    ).not.toBeNull();
    const pick = [...view.querySelectorAll("button")].find(
      (b) => b.textContent === "pick-replacement",
    );
    act(() => pick?.click());
    await flush();
    await flush();
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ from: OLD, to: NEW });
    expect(fake.zoteroFetchSource).toHaveBeenCalledWith("NEWW3333");
    expect(view.textContent).toMatch(/Replaced the source in 1 experiment/);
    expect(view.querySelector('[role="dialog"]')).toBeNull();
    const labels = [...view.querySelectorAll("li[data-status]")].map((li) =>
      li.getAttribute("data-status"),
    );
    expect(labels).toEqual(["missing", "ok"]);
  });

  it("closes the picker on Cancel and changes nothing", async () => {
    const applied: SourceReplacement[] = [];
    const { view, fake } = await mount([held(OLD, "Old", "trashed")], {
      apply: applied,
    });
    act(() => replaceButtons(view)[0]?.click());
    const cancel = [...view.querySelectorAll("button")].find(
      (b) => b.textContent === "Cancel",
    );
    act(() => cancel?.click());
    expect(view.querySelector('[role="dialog"]')).toBeNull();
    expect(applied).toEqual([]);
    expect(fake.zoteroFetchSource).not.toHaveBeenCalled();
  });
});
