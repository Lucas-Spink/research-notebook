import { describe, expect, it } from "vitest";
import {
  AUTHOR_DATE_STYLE,
  BUNDLED_STYLES,
  NUMERIC_STYLE,
  styleFileName,
  validateStyle,
} from "./index";

/** S5-G08: note-class CSL styles are rejected with a message the person can act on. */

const swap = (xml: string, from: string, to: string) => xml.replace(from, to);

describe("validateStyle (FR-CIT-11)", () => {
  it("accepts every bundled style", () => {
    for (const bundled of BUNDLED_STYLES) {
      const checked = validateStyle(bundled.xml);
      expect(checked.ok, bundled.file).toBe(true);
    }
  });

  it("reports the title and id of an accepted style", () => {
    const checked = validateStyle(NUMERIC_STYLE);
    expect(checked.ok && checked.value.title).toBe("Notebook numeric");
    expect(checked.ok && checked.value.id).toContain("numeric");
  });

  it("rejects a note style with a reason that names note styles", () => {
    const note = swap(NUMERIC_STYLE, 'class="in-text"', 'class="note"');
    const checked = validateStyle(note);
    expect(checked).toMatchObject({ ok: false, error: { kind: "noteStyle" } });
  });

  it("rejects a dependent style, which needs a parent the app cannot fetch", () => {
    const dependent = `<?xml version="1.0"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info><title>Child</title><id>x</id>
    <link href="https://example.org/parent" rel="independent-parent"/>
  </info>
</style>`;
    expect(validateStyle(dependent)).toMatchObject({
      ok: false,
      error: { kind: "dependent" },
    });
  });

  it("rejects text that is not a CSL style", () => {
    for (const text of ["", "   ", "plain text", "<html></html>", "<style/>"]) {
      const checked = validateStyle(text);
      expect(checked.ok, text).toBe(false);
    }
  });

  it("rejects a style with no citation layout", () => {
    const bare = NUMERIC_STYLE.replace(/<citation>[\s\S]*?<\/citation>/, "");
    expect(validateStyle(bare)).toMatchObject({
      ok: false,
      error: { kind: "noCitation" },
    });
  });

  it("rejects a style citeproc cannot run", () => {
    const broken = swap(NUMERIC_STYLE, "<layout", "<layout><text macro=");
    expect(validateStyle(broken).ok).toBe(false);
  });

  it("is not fooled by a note class in a comment or in a later element", () => {
    const sneaky = `<!-- class="note" -->${NUMERIC_STYLE}`;
    expect(validateStyle(sneaky).ok).toBe(true);
    const noteAfter = swap(
      NUMERIC_STYLE,
      "<info>",
      '<info><category class="note"/>',
    );
    expect(validateStyle(noteAfter).ok).toBe(true);
  });

  it("refuses a file over one mebibyte", () => {
    const huge = `${NUMERIC_STYLE}<!-- ${"x".repeat(1_100_000)} -->`;
    expect(validateStyle(huge)).toMatchObject({
      ok: false,
      error: { kind: "tooLarge" },
    });
  });

  it("returns the text with LF line endings and no byte order mark", () => {
    const crlf = `\uFEFF${AUTHOR_DATE_STYLE.replace(/\n/g, "\r\n")}`;
    const checked = validateStyle(crlf);
    expect(checked.ok && checked.value.xml).toBe(AUTHOR_DATE_STYLE);
  });
});

describe("styleFileName", () => {
  it("makes a lower-case .csl name from a title or file name", () => {
    expect(styleFileName("Nature (2024)")).toBe("nature-2024.csl");
    expect(styleFileName("My Style.csl")).toBe("my-style.csl");
  });

  it("never returns a path, a hidden name or an overlong one", () => {
    for (const input of ["../../x", "..", ".hidden", "a".repeat(200), "###"]) {
      const name = styleFileName(input);
      expect(name).toMatch(/^[a-z0-9][a-z0-9-]*\.csl$/);
      expect(name.length).toBeLessThanOrEqual(64);
    }
  });
});
