// @vitest-environment jsdom
//
// citeproc-js needs a global DOMParser for its internal XML handling.
// jsdom (an existing devDependency, used for the "ui" project) provides
// one; this avoids adding a new dependency just for tests.
import { describe, expect, it } from "vitest";
import type { CslItem } from "./citeproc-engine";
import { createState, handleMessage } from "./citeproc-engine";

const LOCALE_XML = `<?xml version="1.0" encoding="utf-8"?>
<locale xmlns="http://purl.org/net/xbiblio/csl" xml:lang="en-US">
  <terms>
    <term name="and">and</term>
    <term name="et-al">et al.</term>
    <term name="ibid">ibid.</term>
    <term name="editor" form="short">ed.</term>
    <term name="edition">edition</term>
    <term name="page" form="short">p.</term>
    <term name="anonymous">anonymous</term>
    <term name="no date" form="short">n.d.</term>
    <term name="ordinal">th</term>
    <term name="ordinal-01">st</term>
    <term name="ordinal-02">nd</term>
    <term name="ordinal-03">rd</term>
    <term name="long-ordinal-01">first</term>
  </terms>
</locale>`;

const NUMERIC_STYLE = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info>
    <title>Test Numeric</title>
    <id>http://example.com/test-numeric</id>
    <updated>2026-01-01T00:00:00Z</updated>
  </info>
  <macro name="title">
    <text variable="title"/>
  </macro>
  <citation>
    <sort>
      <key variable="citation-number"/>
    </sort>
    <layout prefix="[" suffix="]" delimiter=",">
      <text variable="citation-number"/>
    </layout>
  </citation>
  <bibliography>
    <layout>
      <text variable="citation-number" prefix="[" suffix="] "/>
      <names variable="author">
        <name and="text" delimiter=", "/>
      </names>
      <text macro="title" prefix=". "/>
    </layout>
  </bibliography>
</style>`;

const AUTHOR_DATE_STYLE = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info>
    <title>Test Author-Date</title>
    <id>http://example.com/test-author-date</id>
    <updated>2026-01-01T00:00:00Z</updated>
  </info>
  <macro name="author-short">
    <names variable="author">
      <name form="short" and="text" delimiter=", "/>
    </names>
  </macro>
  <macro name="title">
    <text variable="title"/>
  </macro>
  <citation>
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=", ">
        <text macro="author-short"/>
        <date variable="issued">
          <date-part name="year"/>
        </date>
      </group>
    </layout>
  </citation>
  <bibliography>
    <layout>
      <names variable="author">
        <name and="text" delimiter=", "/>
      </names>
      <date variable="issued" prefix=" (" suffix=").">
        <date-part name="year"/>
      </date>
      <text macro="title" prefix=" "/>
    </layout>
  </bibliography>
</style>`;

const ITEMS: Record<string, CslItem> = {
  item1: {
    id: "item1",
    type: "article-journal",
    title: "A Study of Widgets",
    author: [{ family: "Smith", given: "Jane" }],
    issued: { "date-parts": [[2020]] },
  },
  item2: {
    id: "item2",
    type: "book",
    title: "The Widget Handbook",
    author: [{ family: "Doe", given: "Jo" }],
    issued: { "date-parts": [[2018]] },
  },
  item3: {
    id: "item3",
    type: "article-journal",
    title: "Widgets Revisited",
    author: [{ family: "Lee", given: "Kim" }],
    issued: { "date-parts": [[2022]] },
  },
};

function initialised(styleXml: string) {
  const init = handleMessage(createState(), {
    type: "init",
    styleXml,
    localeXml: LOCALE_XML,
    items: ITEMS,
  });
  return init.state;
}

const c1 = {
  citationID: "c1",
  citationItems: [{ id: "item1" }],
  properties: { noteIndex: 0 },
};
const c2 = {
  citationID: "c2",
  citationItems: [{ id: "item2" }],
  properties: { noteIndex: 0 },
};
const c3 = {
  citationID: "c3",
  citationItems: [{ id: "item3" }],
  properties: { noteIndex: 0 },
};

describe("citeproc-js numeric style (spec 7.8, FR-CIT-09/10)", () => {
  it("numbers citations by first appearance and renumbers on mid-insert", () => {
    let state = initialised(NUMERIC_STYLE);

    const r1 = handleMessage(state, {
      type: "cite",
      citation: c1,
      citationsPre: [],
      citationsPost: [],
    });
    state = r1.state;
    expect(r1.response).toEqual({
      type: "cite",
      bibliographyChanged: true,
      updates: [{ index: 0, text: "[1]", citationID: "c1" }],
    });

    const r2 = handleMessage(state, {
      type: "cite",
      citation: c2,
      citationsPre: [["c1", 0]],
      citationsPost: [],
    });
    state = r2.state;
    expect(r2.response).toEqual({
      type: "cite",
      bibliographyChanged: true,
      updates: [{ index: 1, text: "[2]", citationID: "c2" }],
    });

    // Insert c3 between c1 and c2: c2 must renumber from [2] to [3].
    const r3 = handleMessage(state, {
      type: "cite",
      citation: c3,
      citationsPre: [["c1", 0]],
      citationsPost: [["c2", 2]],
    });
    state = r3.state;
    expect(r3.response).toEqual({
      type: "cite",
      bibliographyChanged: true,
      updates: [
        { index: 1, text: "[2]", citationID: "c3" },
        { index: 2, text: "[3]", citationID: "c2" },
      ],
    });

    const bib = handleMessage(state, { type: "bibliography" });
    expect(bib.response).toEqual({
      type: "bibliography",
      entries: [
        '  <div class="csl-entry">[1] Jane Smith. A Study of Widgets</div>\n',
        '  <div class="csl-entry">[2] Kim Lee. Widgets Revisited</div>\n',
        '  <div class="csl-entry">[3] Jo Doe. The Widget Handbook</div>\n',
      ],
    });
  });

  it("renumbers remaining citations and the bibliography after a deletion", () => {
    let state = initialised(NUMERIC_STYLE);
    state = handleMessage(state, {
      type: "cite",
      citation: c1,
      citationsPre: [],
      citationsPost: [],
    }).state;
    state = handleMessage(state, {
      type: "cite",
      citation: c2,
      citationsPre: [["c1", 0]],
      citationsPost: [],
    }).state;
    state = handleMessage(state, {
      type: "cite",
      citation: c3,
      citationsPre: [["c1", 0]],
      citationsPost: [["c2", 2]],
    }).state;

    // Delete c1: remaining document order is [c3, c2].
    const afterDelete = handleMessage(state, {
      type: "cite",
      citation: c3,
      citationsPre: [],
      citationsPost: [["c2", 1]],
    });
    expect(afterDelete.response).toEqual({
      type: "cite",
      bibliographyChanged: true,
      updates: [
        { index: 0, text: "[1]", citationID: "c3" },
        { index: 1, text: "[2]", citationID: "c2" },
      ],
    });

    const bib = handleMessage(afterDelete.state, { type: "bibliography" });
    expect(bib.response).toEqual({
      type: "bibliography",
      entries: [
        '  <div class="csl-entry">[1] Kim Lee. Widgets Revisited</div>\n',
        '  <div class="csl-entry">[2] Jo Doe. The Widget Handbook</div>\n',
      ],
    });
  });
});

describe("citeproc-js author-date style (spec 7.8, FR-CIT-09/10)", () => {
  it("renders (Author, Year) without renumbering on insert", () => {
    let state = initialised(AUTHOR_DATE_STYLE);

    const r1 = handleMessage(state, {
      type: "cite",
      citation: c1,
      citationsPre: [],
      citationsPost: [],
    });
    state = r1.state;
    expect(r1.response).toEqual({
      type: "cite",
      bibliographyChanged: true,
      updates: [{ index: 0, text: "(Smith, 2020)", citationID: "c1" }],
    });

    const r2 = handleMessage(state, {
      type: "cite",
      citation: c2,
      citationsPre: [["c1", 0]],
      citationsPost: [],
    });
    state = r2.state;
    expect(r2.response).toEqual({
      type: "cite",
      bibliographyChanged: true,
      updates: [{ index: 1, text: "(Doe, 2018)", citationID: "c2" }],
    });

    const r3 = handleMessage(state, {
      type: "cite",
      citation: c3,
      citationsPre: [["c1", 0]],
      citationsPost: [["c2", 2]],
    });
    // Author-date does not renumber c2 when c3 is inserted before it.
    expect(r3.response).toEqual({
      type: "cite",
      bibliographyChanged: true,
      updates: [{ index: 1, text: "(Lee, 2022)", citationID: "c3" }],
    });

    const bib = handleMessage(r3.state, { type: "bibliography" });
    expect(bib.response).toEqual({
      type: "bibliography",
      entries: [
        '  <div class="csl-entry">Jane Smith (2020). A Study of Widgets</div>\n',
        '  <div class="csl-entry">Kim Lee (2022). Widgets Revisited</div>\n',
        '  <div class="csl-entry">Jo Doe (2018). The Widget Handbook</div>\n',
      ],
    });
  });

  it("updates the bibliography after a deletion", () => {
    let state = initialised(AUTHOR_DATE_STYLE);
    state = handleMessage(state, {
      type: "cite",
      citation: c1,
      citationsPre: [],
      citationsPost: [],
    }).state;
    state = handleMessage(state, {
      type: "cite",
      citation: c2,
      citationsPre: [["c1", 0]],
      citationsPost: [],
    }).state;
    state = handleMessage(state, {
      type: "cite",
      citation: c3,
      citationsPre: [["c1", 0]],
      citationsPost: [["c2", 2]],
    }).state;

    const afterDelete = handleMessage(state, {
      type: "cite",
      citation: c3,
      citationsPre: [],
      citationsPost: [["c2", 1]],
    });
    expect(afterDelete.response).toEqual({
      type: "cite",
      bibliographyChanged: true,
      updates: [{ index: 0, text: "(Lee, 2022)", citationID: "c3" }],
    });

    const bib = handleMessage(afterDelete.state, { type: "bibliography" });
    expect(bib.response).toEqual({
      type: "bibliography",
      entries: [
        '  <div class="csl-entry">Kim Lee (2022). Widgets Revisited</div>\n',
        '  <div class="csl-entry">Jo Doe (2018). The Widget Handbook</div>\n',
      ],
    });
  });
});
