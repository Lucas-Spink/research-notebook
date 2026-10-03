import { Citekey } from "../schema";
import {
  CITATION_ANCHORED,
  CITATION_IN_TEXT_ANCHORED,
  CITATION_ITEM,
} from "./citation";
import { citationClusters } from "./citationContext";
import { mapProseLines, skipCodeSpan } from "./citekeyRewrite";

/** Whether `part` of a cluster is a valid citation of `citekey`; `null` when it is not a citation at all. */
function isItemOf(part: string, citekey: string): boolean | null {
  const found = CITATION_ITEM.exec(part.trim())?.[3];
  if (found === undefined || !Citekey.safeParse(found).success) return null;
  return found === citekey;
}

/** A bracketed cluster without `citekey`: `""` when nothing is left, `null` when it is not a citation. */
function withoutFromCluster(body: string, citekey: string): string | null {
  const parts = body.split(";");
  const flags = parts.map((part) => isItemOf(part, citekey));
  if (flags.some((flag) => flag === null)) return null;
  const kept = parts.filter((_, index) => flags[index] === false);
  if (kept.length === 0) return "";
  return kept
    .map((part, index) => (index === 0 ? part.trimStart() : part))
    .join(";");
}

function removeFromLine(line: string, citekey: string): string {
  let out = "";
  let at = 0;
  while (at < line.length) {
    const char = line[at];
    const rest = line.slice(at);
    if (char === "`") {
      const end = skipCodeSpan(line, at);
      out += line.slice(at, end);
      at = end;
      continue;
    }
    const cluster = char === "[" ? CITATION_ANCHORED.exec(rest) : null;
    const kept =
      cluster === null ? null : withoutFromCluster(cluster[1] ?? "", citekey);
    if (cluster !== null && kept !== null) {
      if (kept === "") {
        // The space that set the citation off from the word before goes with it.
        if (out.endsWith(" ")) out = out.slice(0, -1);
      } else {
        out += `[${kept}]`;
      }
      at += cluster[0].length;
      continue;
    }
    const inText = char === "@" ? CITATION_IN_TEXT_ANCHORED.exec(rest) : null;
    const found = inText?.[1];
    if (
      inText !== null &&
      found === citekey &&
      Citekey.safeParse(found).success
    ) {
      if (out.endsWith(" ")) out = out.slice(0, -1);
      at += inText[0].length;
      continue;
    }
    out += char;
    at += 1;
  }
  return out;
}

/**
 * `text` with every citation of `citekey` taken out (detaching a source from
 * an experiment): a bracketed citation of only that source goes whole, one
 * among several loses just its own item, and a hand-written author-in-text
 * form goes too. Everything else, citations of other sources and anything
 * inside code, is kept byte for byte. Uses the section editor's own patterns
 * and `Citekey` check, so both agree on what a citation is.
 */
export function removeCitekey(text: string, citekey: string): string {
  if (text === "" || !text.includes(citekey)) return text;
  return mapProseLines(text, (line) => removeFromLine(line, citekey));
}

/**
 * `text` with a citation of `citekey` added as a paragraph of its own at the
 * end (attaching a source to an experiment), so it never lands inside a
 * list, table or code fence. Text that already cites it is returned as it
 * is. The text's trailing newline, if it had one, is kept.
 */
export function appendCitation(text: string, citekey: string): string {
  if (citesCitekey(text, citekey)) return text;
  const citation = `[@${citekey}]`;
  const body = text.replace(/\s+$/, "");
  if (body === "") return text.endsWith("\n") ? `${citation}\n` : citation;
  return `${body}\n\n${citation}${text.endsWith("\n") ? "\n" : ""}`;
}

/** Whether `text` cites `citekey` in any form the section editor recognises. */
export function citesCitekey(text: string, citekey: string): boolean {
  return citationClusters(text).some((cluster) =>
    cluster.items.some((item) => item.citekey === citekey),
  );
}
