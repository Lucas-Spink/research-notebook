/**
 * The styles and locale the application ships with. Written for this project
 * (not copied from the CSL repository, whose styles are CC BY-SA), so they
 * carry the project's licence. `class="in-text"` throughout: note styles are
 * refused (FR-CIT-11, S5-T06).
 */

const STYLE_HEAD = (
  title: string,
  id: string,
) => `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="en-US">
  <info>
    <title>${title}</title>
    <id>${id}</id>
    <updated>2026-10-02T00:00:00Z</updated>
    <rights>AGPL-3.0-or-later</rights>
  </info>`;

const SHARED_MACROS = `
  <macro name="author">
    <names variable="author">
      <name and="symbol" delimiter=", " delimiter-precedes-last="never" initialize-with=". " name-as-sort-order="all" sort-separator=", "/>
    </names>
  </macro>
  <macro name="author-short">
    <names variable="author">
      <name form="short" and="symbol" delimiter=", " delimiter-precedes-last="never"/>
    </names>
  </macro>
  <macro name="container">
    <text variable="container-title" font-style="italic" suffix=" "/>
  </macro>
  <macro name="year">
    <date variable="issued" prefix="(" suffix=")">
      <date-part name="year"/>
    </date>
  </macro>`;

/** Numbered entries, "1. Author. Title. *Journal* (Year).", in order of first citation. */
export const NUMERIC_STYLE = `${STYLE_HEAD("Notebook numeric", "https://research-notebook.invalid/styles/numeric")}${SHARED_MACROS}
  <citation>
    <sort>
      <key variable="citation-number"/>
    </sort>
    <layout prefix="[" suffix="]" delimiter=", ">
      <text variable="citation-number"/>
    </layout>
  </citation>
  <bibliography>
    <layout>
      <text variable="citation-number" suffix=". "/>
      <text macro="author" suffix=" "/>
      <text variable="title" suffix=". "/>
      <text macro="container"/>
      <text macro="year" suffix="."/>
    </layout>
  </bibliography>
</style>`;

/** Author-date: "(Smith 2020)" in text, entries sorted by author and year. */
export const AUTHOR_DATE_STYLE = `${STYLE_HEAD("Notebook author-date", "https://research-notebook.invalid/styles/author-date")}${SHARED_MACROS}
  <citation>
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=" ">
        <text macro="author-short"/>
        <date variable="issued">
          <date-part name="year"/>
        </date>
      </group>
    </layout>
  </citation>
  <bibliography>
    <sort>
      <key macro="author"/>
      <key variable="issued"/>
    </sort>
    <layout>
      <text macro="author" suffix=" "/>
      <text macro="year" suffix=" "/>
      <text variable="title" suffix=". "/>
      <text macro="container"/>
    </layout>
  </bibliography>
</style>`;

/** The terms the bundled styles use; citeproc-js needs a locale to start. */
export const EN_US_LOCALE = `<?xml version="1.0" encoding="utf-8"?>
<locale xmlns="http://purl.org/net/xbiblio/csl" version="1.0" xml:lang="en-US">
  <style-options punctuation-in-quote="true"/>
  <terms>
    <term name="and">and</term>
    <term name="and others">and others</term>
    <term name="et-al">et al.</term>
    <term name="anonymous">anonymous</term>
    <term name="no date" form="short">n.d.</term>
    <term name="page" form="short">p.</term>
    <term name="editor" form="short">ed.</term>
    <term name="ibid">ibid.</term>
    <term name="ordinal">th</term>
    <term name="ordinal-01">st</term>
    <term name="ordinal-02">nd</term>
    <term name="ordinal-03">rd</term>
  </terms>
</locale>`;

/** What a project falls back to when its `citation_style` file is not in `styles/`. */
export const DEFAULT_STYLE_XML = NUMERIC_STYLE;
