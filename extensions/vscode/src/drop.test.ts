import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { filesFromUriList } from "./drop";

/** A `file:` URI for a path on this machine, as VS Code writes it. */
const uri = (...segments: string[]): string =>
  pathToFileURL(join(tmpdir(), ...segments)).toString();

/** VS Code gives a dropped Explorer selection as `toString()`ed URIs, one per line, `\r\n` apart. */
describe("filesFromUriList", () => {
  it("reads one file URI back to its path", () => {
    expect(filesFromUriList(uri("results", "plot.png"))).toEqual([
      join(tmpdir(), "results", "plot.png"),
    ]);
  });

  it("reads several, separated by CRLF or LF, ignoring blank lines", () => {
    const text = `${uri("a", "one.png")}\r\n${uri("a", "two.png")}\n\n${uri("a", "three.png")}\r\n`;
    expect(filesFromUriList(text).map((p) => basename(p))).toEqual([
      "one.png",
      "two.png",
      "three.png",
    ]);
  });

  it("decodes percent escapes, including spaces", () => {
    const text = uri("Rotation 1", "my plot.png");
    expect(text).toContain("%20");
    expect(filesFromUriList(text)).toEqual([
      join(tmpdir(), "Rotation 1", "my plot.png"),
    ]);
  });

  it("skips comment lines, which the format allows", () => {
    const text = `# dropped from the Explorer\n${uri("a", "one.png")}`;
    expect(filesFromUriList(text)).toHaveLength(1);
  });

  it("skips anything that is not a file: URI, such as a web address or an untitled editor", () => {
    const text = [
      "https://example.com/a.png",
      "untitled:Untitled-1",
      "vscode-remote://ssh-remote+host/a.png",
      uri("a", "one.png"),
    ].join("\r\n");
    expect(filesFromUriList(text)).toHaveLength(1);
  });

  it("ignores the line and column VS Code may add as a fragment", () => {
    expect(filesFromUriList(`${uri("a", "script.R")}#L3,5`)).toEqual([
      join(tmpdir(), "a", "script.R"),
    ]);
  });

  it("skips text that is not a URI at all", () => {
    expect(filesFromUriList("not a uri\r\n   \r\n")).toEqual([]);
  });

  it("has nothing for an empty drop", () => {
    expect(filesFromUriList("")).toEqual([]);
  });
});
