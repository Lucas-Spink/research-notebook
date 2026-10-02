import {
  EN_US_LOCALE,
  NUMERIC_STYLE,
  renderLiterature,
} from "@research-notebook/citations";
import {
  serialiseBibliography,
  type BibliographyFileModel,
  type ExperimentBodyModel,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../shared/sha256";
import { LiteraturePrompt } from "./LiteraturePrompt";
import type { StyleApi } from "./model/styleSource";
import { SourcesProvider } from "./SourcesContext";
import type { SourcesApi } from "./model/syncSources";
import {
  useLiteraturePlanner,
  type LiteratureChoice,
  type LiteraturePlanner,
} from "./useLiteraturePlanner";

const KEY = "z:u:SMIT2222";
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

const SOURCES: BibliographyFileModel = [
  {
    id: KEY,
    type: "book",
    title: "Widgets",
    author: [{ family: "Smith", given: "Pat" }],
    issued: { "date-parts": [[2020]] },
    _zotero: {
      server_id: null,
      library: "u",
      key: "SMIT2222",
      fetched: "2026-10-02T09:00:00Z",
      status: "ok",
    },
  },
];

function api() {
  const text = serialiseBibliography(SOURCES);
  return {
    zoteroFetchSource: vi.fn(),
    readNotebookFile: vi.fn((_folder: number, path: string) =>
      Promise.resolve(
        path.endsWith("bibliography.json")
          ? ok({ kind: "text", text, sha256: sha256Hex(text) })
          : ok({ kind: "text", text: NUMERIC_STYLE, sha256: "s" }),
      ),
    ),
    writeNotebookFile: vi.fn(),
  };
}

function body(literature: string | null): ExperimentBodyModel {
  return {
    preamble: "",
    sections: [{ key: "methods", body: `See [@${KEY}].` }],
    literature,
  };
}

async function mount(
  render = (i: Parameters<typeof renderLiterature>[0]) =>
    Promise.resolve(renderLiterature(i)),
) {
  let planner: LiteraturePlanner | null = null;
  function Harness() {
    const literature = useLiteraturePlanner({
      folder: 7,
      styleFile: "nature.csl",
      api: api() as unknown as StyleApi,
      render,
    });
    planner = literature.plan;
    return <LiteraturePrompt literature={literature} />;
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SourcesProvider folder={7} writable api={api() as unknown as SourcesApi}>
        <Harness />
      </SourcesProvider>,
    ),
  );
  await flush();
  return {
    plan: (stored: ExperimentBodyModel, text: string) => {
      if (planner === null) throw new Error("not mounted");
      return planner(stored, "methods", text);
    },
    container,
  };
}

const GENERATED = "## Literature\n\n1. Smith, P. Widgets. (2020).";

describe("useLiteraturePlanner (FR-CIT-10)", () => {
  it("returns the regenerated block from bibliography.json and the project's style", async () => {
    const { plan } = await mount();
    const choice = await plan(body(null), `Cited [@${KEY}] now.`);
    expect(choice?.literature).toBe(GENERATED);
  });

  it("does not ask when the stored block is what the app generated", async () => {
    const { plan, container } = await mount();
    const choice = await plan(body(GENERATED), `Cited [@${KEY}] again.`);
    expect(choice?.literature).toBe(GENERATED);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("asks before replacing a block that was edited, and replaces on yes", async () => {
    const { plan, container } = await mount();
    const pending: Promise<LiteratureChoice> = plan(
      body("1. Hand written."),
      `Cited [@${KEY}] again.`,
    );
    await flush();
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    const replace = [...container.querySelectorAll("button")].find((b) =>
      /replace/i.test(b.textContent ?? ""),
    );
    act(() => replace?.click());
    expect((await pending)?.literature).toBe(GENERATED);
    await flush();
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("keeps the edited block on no, and does not ask again for the same block", async () => {
    const { plan, container } = await mount();
    const edited = body("1. Hand written.");
    const first = plan(edited, "one [@" + KEY + "]");
    await flush();
    const keep = [...container.querySelectorAll("button")].find((b) =>
      /keep/i.test(b.textContent ?? ""),
    );
    act(() => keep?.click());
    expect(await first).toBeNull();
    await flush();
    const second = await plan(edited, "two [@" + KEY + "]");
    expect(second).toBeNull();
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("leaves the block alone when rendering fails", async () => {
    const { plan } = await mount(() => Promise.reject(new Error("worker")));
    expect(await plan(body(null), `[@${KEY}]`)).toBeNull();
  });

  it("uses the bundled locale", () => {
    expect(EN_US_LOCALE).toContain("en-US");
  });
});
