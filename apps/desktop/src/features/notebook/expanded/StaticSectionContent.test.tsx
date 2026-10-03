import type { ArtefactsFileModel } from "@research-notebook/format";
import {
  parseSectionMarkdown,
  serialiseBibliography,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../../shared/sha256";
import { SourcesProvider, useSources, type SourcesApi } from "../../citations";
import { StaticSectionContent } from "./StaticSectionContent";

function render(
  markdown: string,
  artefacts: ArtefactsFileModel | null = null,
): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <StaticSectionContent
      doc={parseSectionMarkdown(markdown)}
      artefacts={artefacts}
      onActivateReference={() => undefined}
    />,
  );
  return container;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

/** Mounts for real (unlike `render`'s static markup), so events can be dispatched. */
function mount(
  markdown: string,
  artefacts: ArtefactsFileModel | null,
  onActivateReference: (ulid: string, version: number | null) => void,
): HTMLElement {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <StaticSectionContent
        doc={parseSectionMarkdown(markdown)}
        artefacts={artefacts}
        onActivateReference={onActivateReference}
      />,
    ),
  );
  return container;
}

const ULID = "01JB0000000000000000000001";

function artefactsFile(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: ULID,
        name: "PCA by treatment",
        role: "result",
        mode: "copy",
        type: "pdf",
        source: { root: "project", path: "scripts/pca.R" },
        created: "2026-01-01T00:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/pca.v1.pdf",
            sha256: "a".repeat(64),
            size: 10,
            captured: "2026-01-01T00:00:00Z",
          },
        ],
      },
    ],
    groups: [],
  };
}

const REFERENCE = `[Stale label](evidence/pca.v1.pdf "art:${ULID} v1")`;

describe("StaticSectionContent", () => {
  it("renders paragraphs, bold, italic and inline code", () => {
    const view = render("Some **bold**, *italic* and `code` text.");
    expect(view.querySelector("strong")?.textContent).toBe("bold");
    expect(view.querySelector("em")?.textContent).toBe("italic");
    expect(view.querySelector("code")?.textContent).toBe("code");
  });

  it("renders headings at levels 3 and 4", () => {
    const view = render("### Sub-section\n\n#### Detail");
    expect(view.querySelector("h3")?.textContent).toBe("Sub-section");
    expect(view.querySelector("h4")?.textContent).toBe("Detail");
  });

  it("renders block quotes, lists and links", () => {
    const view = render(
      "> a caveat\n\n- one\n- two\n\n[the protocol](https://example.org/protocol)",
    );
    expect(view.querySelector("blockquote")?.textContent).toBe("a caveat");
    expect(view.querySelectorAll("ul li")).toHaveLength(2);
    const link = view.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.org/protocol");
    expect(link?.textContent).toBe("the protocol");
  });

  it("renders a passthrough block's raw Markdown, labelled as not editable here", () => {
    const view = render("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(view.querySelector(".expanded__passthrough-text")?.textContent).toBe(
      "| a | b |\n| - | - |\n| 1 | 2 |",
    );
    expect(
      view.querySelector(".expanded__passthrough-label")?.textContent,
    ).toBe("Not editable here — kept as written");
  });

  it("renders a reference plainly by its stored label before the artefacts file loads", () => {
    const view = render(REFERENCE);
    expect(view.querySelector(".expanded__artefact-ref")?.textContent).toBe(
      "Stale label",
    );
    expect(view.querySelector('[role="button"]')).toBeNull();
  });

  it("renders a reference as an interactive chip with the artefact's current name once resolved", () => {
    const view = mount(REFERENCE, artefactsFile(), () => undefined);
    const chip = view.querySelector(".expanded__artefact-ref--chip");
    expect(chip?.textContent).toBe("PCA by treatment");
    expect(chip?.getAttribute("role")).toBe("button");
  });

  it("activates a resolved reference's onActivateReference with its ULID and pinned version", () => {
    const onActivateReference = vi.fn();
    const view = mount(REFERENCE, artefactsFile(), onActivateReference);
    const chip = view.querySelector(".expanded__artefact-ref--chip");
    act(() => {
      chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onActivateReference).toHaveBeenCalledWith(ULID, 1);
  });

  it("renders a citation cluster plainly by its citekeys (spec 5.7, S5-T03)", () => {
    const view = render(
      "[see @z:u:9HJ3LM2N, fig. 2; @z:g4521:ABCD2345, pp. 10-12]",
    );
    expect(view.querySelector(".expanded__citation")?.textContent).toBe(
      "[@z:u:9HJ3LM2N; @z:g4521:ABCD2345]",
    );
  });

  it("renders a hand-written author-in-text citation with its locator (spec 5.7, S5-T03)", () => {
    const view = render("@z:u:7XK2PQ9M [p. 4] showed this.");
    expect(view.querySelector(".expanded__citation-in-text")?.textContent).toBe(
      "@z:u:7XK2PQ9M [p. 4]",
    );
  });

  it("renders a hand-written author-in-text citation with no locator", () => {
    const view = render("As @z:u:7XK2PQ9M showed, the effect held.");
    expect(view.querySelector(".expanded__citation-in-text")?.textContent).toBe(
      "@z:u:7XK2PQ9M",
    );
  });
});

describe("StaticSectionContent: opening a citation (FR-CIT-04, S5-T07)", () => {
  const bibliography = ["AAAA2222", "BBBB3333"].map((key) => ({
    id: `z:u:${key}`,
    type: "book",
    title: `Title ${key}`,
    _zotero: {
      server_id: null,
      library: "u",
      key,
      fetched: "2026-10-01T09:00:00Z",
      status: "ok" as const,
    },
  }));

  function Probe() {
    return <output>{useSources().selected ?? "none"}</output>;
  }

  async function mountWithSources(
    markdown: string,
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
          <div onClick={onOuterClick}>
            <StaticSectionContent
              doc={parseSectionMarkdown(markdown)}
              artefacts={null}
              onActivateReference={() => undefined}
            />
          </div>
          <Probe />
        </SourcesProvider>,
      ),
    );
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    return container;
  }

  const click = (element: Element | null | undefined) =>
    act(() => {
      element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

  it("opens the source of each entry in a citation cluster", async () => {
    const view = await mountWithSources("[@z:u:AAAA2222; @z:u:BBBB3333]");
    const buttons = view.querySelectorAll(".expanded__citation button");
    expect(buttons).toHaveLength(2);
    click(buttons[1]);
    expect(view.querySelector("output")?.textContent).toBe("z:u:BBBB3333");
  });

  it("keeps the cluster's text as it was", async () => {
    const view = await mountWithSources("[@z:u:AAAA2222; @z:u:BBBB3333]");
    expect(view.querySelector(".expanded__citation")?.textContent).toBe(
      "[Title AAAA2222; Title BBBB3333]",
    );
  });

  it("opens the source of an author-in-text citation", async () => {
    const view = await mountWithSources("As @z:u:AAAA2222 showed, it held.");
    click(view.querySelector(".expanded__citation-in-text button"));
    expect(view.querySelector("output")?.textContent).toBe("z:u:AAAA2222");
  });

  it("does not offer a button for a source the bibliography does not hold", async () => {
    const view = await mountWithSources("[@z:u:ZZZZ9999]");
    expect(view.querySelector(".expanded__citation button")).toBeNull();
  });

  it("does not let the click reach an enclosing cell", async () => {
    const outer = vi.fn();
    const view = await mountWithSources("[@z:u:AAAA2222]", outer);
    click(view.querySelector(".expanded__citation button"));
    expect(outer).not.toHaveBeenCalled();
  });
});
