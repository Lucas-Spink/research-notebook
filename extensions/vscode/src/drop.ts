import { fileURLToPath } from "node:url";

/**
 * The files named by a drop from VS Code's Explorer: the `text/uri-list`
 * payload, `toString()`ed URIs separated by line breaks, where a `#` line is a
 * comment. Anything that is not a `file:` URI (a web address, an untitled
 * editor, a remote workspace) is skipped, since nothing there can be hashed
 * and copied from this machine. A `#L3,5` fragment, which VS Code may add to
 * point into a file, is dropped.
 */
export function filesFromUriList(text: string): string[] {
  const paths: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    let url: URL;
    try {
      url = new URL(line);
    } catch {
      continue;
    }
    if (url.protocol !== "file:") continue;
    url.hash = "";
    try {
      paths.push(fileURLToPath(url));
    } catch {
      // A file URI that names no path on this platform, such as a bare host.
    }
  }
  return paths;
}
