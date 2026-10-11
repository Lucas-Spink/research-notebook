import { describe, expect, it } from "vitest";
import { projectFormatVersion } from "./project";

/** The probe tells an older project from an invalid one without trusting the rest of the file. */

describe("projectFormatVersion", () => {
  it("reads the version of any project.yaml, whatever else it holds", () => {
    expect(projectFormatVersion("format_version: 1\nname: x\n")).toBe(1);
    expect(projectFormatVersion("format_version: 7\nanything: [1, 2]\n")).toBe(
      7,
    );
  });

  it("reads past a byte-order mark and CRLF line endings", () => {
    expect(projectFormatVersion("﻿format_version: 1\r\nname: x\r\n")).toBe(1);
  });

  it.each([
    ["text that is not YAML", "{ not: yaml: at all"],
    ["an empty file", ""],
    ["no version", "name: x\n"],
    ["a version that is a string", 'format_version: "1"\n'],
    ["a version of zero", "format_version: 0\n"],
    ["a list", "- format_version: 1\n"],
  ])("returns null for %s", (_label, text) => {
    expect(projectFormatVersion(text)).toBeNull();
  });
});
