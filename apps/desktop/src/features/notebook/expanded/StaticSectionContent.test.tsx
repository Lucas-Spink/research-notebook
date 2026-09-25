import type { ArtefactsFileModel } from "@research-notebook/format";
import { parseSectionMarkdown } from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
