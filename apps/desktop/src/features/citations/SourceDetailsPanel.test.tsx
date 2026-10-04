import {
  serialiseBibliography,
  type BibliographyFileModel,
} from "@research-notebook/format";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../shared/sha256";
import {
  SourceDetailsPanel,
  type SourceDetailsApi,
} from "./SourceDetailsPanel";
import { SourcesProvider, useSources } from "./SourcesContext";
import type { SourcesApi } from "./model/syncSources";

const ok = (data: unknown) => ({ status: "ok", data });
const failure = (kind: string) => ({ status: "error", error: { kind } });
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

function source(
  extra: Record<string, unknown> = {},
  status: "ok" | "trashed" | "missing" = "ok",
  library = "u",
): BibliographyFileModel[number] {
  return {
    id: `z:${library}:ABCD2345`,
    type: "article-journal",
    title: "On radioactivity",
    author: [{ family: "Curie", given: "Marie" }],
    issued: { "date-parts": [[1903]] },
    "container-title": "Annals",
    DOI: "10.1000/abc",
    ...extra,
    _zotero: {
      server_id: null,
      library,
      key: "ABCD2345",
      fetched: "2026-10-01T09:00:00Z",
      status,
    },
  };
}

function apis(file: BibliographyFileModel, pdf: unknown = ok(null)) {
  const text = serialiseBibliography(file);
  const sources = {
    readNotebookFile: () =>
      Promise.resolve(ok({ kind: "text", text, sha256: sha256Hex(text) })),
  } as unknown as SourcesApi;
  const details = {
    openSourceLink: vi
      .fn<(link: unknown) => Promise<unknown>>()
      .mockResolvedValue(ok(null)),
    zoteroPdfAttachment: vi
      .fn<(library: string, key: string) => Promise<unknown>>()
      .mockResolvedValue(pdf),
  };
  return { sources, details, api: details as unknown as SourceDetailsApi };
}

function Opener({ citekey }: { citekey: string }) {
  const { select } = useSources();
  return (
    <button type="button" onClick={() => select(citekey)}>
      cite
    </button>
  );
}

const PANEL = "[aria-labelledby='source-details-heading']";

async function mount(
  file: BibliographyFileModel,
  pdf?: unknown,
  select = "z:u:ABCD2345",
  citedBy: Partial<ComponentProps<typeof SourceDetailsPanel>> = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const fakes = apis(file, pdf);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SourcesProvider api={fakes.sources} folder={1} writable>
        <Opener citekey={select} />
        <SourceDetailsPanel api={fakes.api} {...citedBy} />
      </SourcesProvider>,
    ),
  );
  await flush();
  return { view: container, ...fakes };
}

const named = (view: HTMLElement, name: RegExp) =>
  [...view.querySelectorAll("button")].find((b) =>
    name.test(b.textContent ?? ""),
  ) ?? null;

async function click(element: HTMLElement | null) {
  if (element === null) throw new Error("no such button");
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

async function open(
  file: BibliographyFileModel,
  pdf?: unknown,
  citedBy: Partial<ComponentProps<typeof SourceDetailsPanel>> = {},
) {
  const mounted = await mount(file, pdf, undefined, citedBy);
  await click(named(mounted.view, /^cite$/));
  return mounted;
}

describe("SourceDetailsPanel (FR-CIT-04)", () => {
  it("renders nothing until a source is selected", async () => {
    const { view } = await mount([source()]);
    expect(view.querySelector(PANEL)).toBeNull();
  });

  it("shows the cached metadata", async () => {
    const { view } = await open([source()]);
    const text = view.textContent ?? "";
    expect(text).toContain("On radioactivity");
    expect(text).toContain("Marie Curie");
    expect(text).toContain("1903");
    expect(text).toContain("Annals");
    expect(text).toContain("10.1000/abc");
    expect(text).toMatch(/In Zotero/);
  });

  it("opens the item in Zotero from its library and key", async () => {
    const { view, details } = await open([source()]);
    await click(named(view, /open in zotero/i));
    expect(details.openSourceLink).toHaveBeenCalledWith({
      kind: "zoteroItem",
      library: "u",
      key: "ABCD2345",
    });
  });

  it("opens an item of a group library", async () => {
    const { view, details } = await mount(
      [source({}, "ok", "g7")],
      undefined,
      "z:g7:ABCD2345",
    );
    await click(named(view, /^cite$/));
    await click(named(view, /open in zotero/i));
    expect(details.openSourceLink).toHaveBeenCalledWith({
      kind: "zoteroItem",
      library: "g7",
      key: "ABCD2345",
    });
  });

  it("offers the DOI link when there is a linkable DOI", async () => {
    const { view, details } = await open([source()]);
    await click(named(view, /open doi/i));
    expect(details.openSourceLink).toHaveBeenCalledWith({
      kind: "doi",
      doi: "10.1000/abc",
    });
  });

  it.each([[undefined], ["10.1000/a&calc"]])(
    "offers no DOI link for the DOI %j",
    async (DOI) => {
      const { view } = await open([source({ DOI })]);
      expect(named(view, /open doi/i)).toBeNull();
    },
  );

  it("offers Open PDF when Zotero reports a PDF attachment", async () => {
    const { view, details } = await open([source()], ok("PDF22345"));
    expect(details.zoteroPdfAttachment).toHaveBeenCalledWith("u", "ABCD2345");
    await click(named(view, /open pdf/i));
    expect(details.openSourceLink).toHaveBeenCalledWith({
      kind: "zoteroPdf",
      library: "u",
      attachmentKey: "PDF22345",
    });
  });

  it("hides Open PDF and says so when the item has no PDF", async () => {
    const { view } = await open([source()], ok(null));
    expect(named(view, /open pdf/i)).toBeNull();
    expect(view.textContent).toMatch(/no pdf/i);
  });

  it.each([["notRunning"], ["disabled"]])(
    "hides Open PDF with Zotero %s but still shows everything cached",
    async (kind) => {
      const { view } = await open([source()], failure(kind));
      expect(named(view, /open pdf/i)).toBeNull();
      expect(view.textContent).toMatch(/zotero/i);
      expect(view.textContent).toContain("On radioactivity");
      expect(named(view, /open doi/i)).not.toBeNull();
    },
  );

  it("does not ask Zotero about a source that is missing from it", async () => {
    const { view, details } = await open([source({}, "missing")]);
    expect(details.zoteroPdfAttachment).not.toHaveBeenCalled();
    expect(view.textContent).toMatch(/missing from zotero/i);
    expect(named(view, /open in zotero/i)?.disabled).toBe(true);
  });

  it("reports a link that could not be opened", async () => {
    const { view, details } = await open([source()]);
    details.openSourceLink.mockResolvedValueOnce(failure("launchFailed"));
    await click(named(view, /open in zotero/i));
    expect(view.querySelector("[role='status']")?.textContent).toMatch(
      /could not be opened/i,
    );
  });

  it("closes and returns focus to what opened it", async () => {
    const { view } = await mount([source()]);
    const opener = named(view, /^cite$/);
    opener?.focus();
    await click(opener);
    await click(named(view, /close/i));
    expect(view.textContent).not.toContain("On radioactivity");
    expect(document.activeElement).toBe(opener);
  });

  it("shows nothing for a citekey the bibliography does not hold", async () => {
    const { view } = await mount([source()], undefined, "z:u:ZZZZ9999");
    await click(named(view, /^cite$/));
    expect(view.querySelector(PANEL)).toBeNull();
  });

  describe("Cited by (FR-CIT-12)", () => {
    const index = new Map([
      [
        "z:u:ABCD2345",
        [
          {
            experimentFolder: "EXP-001",
            experimentRef: "EXP-001",
            experimentTitle: "First run",
          },
          {
            experimentFolder: "EXP-004",
            experimentRef: "EXP-004",
            experimentTitle: "Repeat",
          },
        ],
      ],
    ]);

    it("lists the experiments citing the source, with Zotero closed", async () => {
      const { view } = await open([source()], undefined, { citedBy: index });
      const list = view.querySelector("ul[aria-label='Cited by']");
      expect(list?.textContent).toContain("EXP-001 First run");
      expect(list?.textContent).toContain("EXP-004 Repeat");
    });

    it("says so when no experiment cites the source", async () => {
      const { view } = await open([source()], undefined, {
        citedBy: new Map(),
      });
      expect(view.textContent).toContain("Not cited by any experiment.");
    });

    it("opens the chosen experiment", async () => {
      const onOpenExperiment = vi.fn();
      const { view } = await open([source()], undefined, {
        citedBy: index,
        onOpenExperiment,
      });
      await click(named(view, /EXP-004 Repeat/));
      expect(onOpenExperiment).toHaveBeenCalledWith("EXP-004");
    });
  });
});
