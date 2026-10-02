import {
  parseSectionMarkdown,
  serialiseBibliography,
  type BibliographyFileModel,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourcesProvider, type SourcesApi } from "../../citations";
import { sha256Hex } from "../../../shared/sha256";
import { StaticSectionContent } from "./StaticSectionContent";

/**
 * S5-G04's render half: with Zotero closed, existing citations render from
 * `bibliography.json` alone (FR-CIT-06), and a source's state is shown.
 */

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

const ok = (data: unknown) => ({ status: "ok", data });

function item(
  status: "ok" | "trashed" | "missing",
): BibliographyFileModel[number] {
  return {
    id: "z:u:ABCD2345",
    type: "book",
    title: "On Radioactivity",
    author: [{ family: "Curie" }],
    issued: { "date-parts": [[1903]] },
    _zotero: {
      server_id: "srv-1",
      library: "u",
      key: "ABCD2345",
      fetched: "2026-10-01T09:00:00Z",
      status,
    },
  };
}

async function render(file: BibliographyFileModel | null, markdown: string) {
  const text = file === null ? null : serialiseBibliography(file);
  // Zotero is closed: any fetch would fail, and none should be made.
  const zoteroFetchSource = vi.fn(() =>
    Promise.resolve({ status: "error", error: { kind: "notRunning" } }),
  );
  const api = {
    zoteroFetchSource,
    readNotebookFile: () =>
      Promise.resolve(
        text === null
          ? ok({ kind: "missing" })
          : ok({ kind: "text", text, sha256: sha256Hex(text) }),
      ),
    writeNotebookFile: vi.fn(),
  };
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SourcesProvider
        // The fake has the same shape as the generated commands.
        api={api as unknown as SourcesApi}
        folder={1}
        writable
      >
        <StaticSectionContent
          doc={parseSectionMarkdown(markdown)}
          artefacts={null}
          onActivateReference={() => undefined}
        />
      </SourcesProvider>,
    ),
  );
  await flush();
  return { view: container, zoteroFetchSource };
}

describe("existing citations render from bibliography.json (S5-G04)", () => {
  it("shows the cached author and year, without contacting Zotero", async () => {
    const { view, zoteroFetchSource } = await render(
      [item("ok")],
      "As shown [@z:u:ABCD2345].",
    );
    expect(view.querySelector(".expanded__citation")?.textContent).toMatch(
      /Curie 1903/,
    );
    expect(zoteroFetchSource).not.toHaveBeenCalled();
  });

  it("renders an in-text citation from the cache too", async () => {
    const { view } = await render([item("ok")], "@z:u:ABCD2345 argued this.");
    expect(
      view.querySelector(".expanded__citation-in-text")?.textContent,
    ).toMatch(/Curie 1903/);
  });

  it("marks a trashed source and a missing source", async () => {
    const trashed = await render([item("trashed")], "[@z:u:ABCD2345]");
    expect(trashed.view.textContent).toMatch(/trash/i);
    act(() => root?.unmount());
    container?.remove();
    const missing = await render([item("missing")], "[@z:u:ABCD2345]");
    expect(missing.view.textContent).toMatch(/missing/i);
  });

  it("does not mark a source that is fine", async () => {
    const { view } = await render([item("ok")], "[@z:u:ABCD2345]");
    expect(view.querySelector(".expanded__citation-state")).toBeNull();
  });

  it("falls back to the citekey for a source not in bibliography.json", async () => {
    const { view } = await render(null, "[@z:u:ABCD2345]");
    expect(view.querySelector(".expanded__citation")?.textContent).toBe(
      "[@z:u:ABCD2345]",
    );
  });
});
