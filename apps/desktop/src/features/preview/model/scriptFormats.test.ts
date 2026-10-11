import { describe, expect, it } from "vitest";
import {
  SCRIPT_FORMATS,
  codeExtensions,
  scriptFormatOf,
  scriptKindOf,
} from "./scriptFormats";

describe("the script format registry (issue #104)", () => {
  it.each([
    ["analysis.py", "python", "code"],
    ["analysis.R", "r", "code"],
    ["analysis.r", "r", "code"],
    ["ANALYSIS.PY", "python", "code"],
    ["cells.ipynb", "python", "notebook"],
    ["run.sh", null, "code"],
  ] as const)("recognises %s", (name, language, view) => {
    expect(scriptFormatOf(name)).toMatchObject({ language, view });
  });

  it("matches the last extension only, and keeps no match for none", () => {
    expect(scriptFormatOf("archive.py.bak")).toBeNull();
    expect(scriptFormatOf("Makefile")).toBeNull();
    expect(scriptFormatOf(".py")).toBeNull();
    expect(scriptFormatOf("notes.txt")).toBeNull();
  });

  it("tells a notebook from code from something unsupported", () => {
    expect(scriptKindOf("a.py")).toBe("code");
    expect(scriptKindOf("a.ipynb")).toBe("notebook");
    expect(scriptKindOf("a.docx")).toBe("unsupported");
  });

  it("lists the extensions of code formats, lower case, without a dot", () => {
    expect(codeExtensions()).toEqual(expect.arrayContaining(["py", "r"]));
    expect(codeExtensions()).not.toContain("ipynb");
  });

  it("holds each extension once, in lower case", () => {
    const extensions = SCRIPT_FORMATS.map((format) => format.extension);
    expect(new Set(extensions).size).toBe(extensions.length);
    for (const extension of extensions) {
      expect(extension).toBe(extension.toLowerCase());
      expect(extension.startsWith(".")).toBe(false);
    }
  });
});
