/**
 * A small reader for the Markdown in notebook cells (issue #104). It builds
 * a tree of plain values that React draws as elements. It never makes HTML
 * text, so a cell cannot add markup or script: `<script>` is shown as the
 * characters it is. Links are shown but not followed, and images are shown
 * as their description, so nothing is loaded from the network.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; content: Inline[] }
  | { kind: "emphasis"; content: Inline[] }
  | { kind: "link"; content: Inline[]; href: string }
  | { kind: "image"; alt: string };

export type Block =
  | { kind: "heading"; level: number; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "quote"; content: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "code"; language: string | null; text: string }
  | { kind: "rule" };

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*```\s*([\w+-]*)\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Nesting of bold inside italic and so on is read this deep, then left as text. */
const MAX_DEPTH = 4;

type Rule = { open: string; kind: "strong" | "emphasis"; close: string };
const EMPHASIS: Rule[] = [
  { open: "**", kind: "strong", close: "**" },
  { open: "__", kind: "strong", close: "__" },
  { open: "*", kind: "emphasis", close: "*" },
  { open: "_", kind: "emphasis", close: "_" },
];

function pushText(out: Inline[], value: string) {
  if (value === "") return;
  const last = out.at(-1);
  if (last?.kind === "text") last.text += value;
  else out.push({ kind: "text", text: value });
}

/** `[text](href)` or `![alt](src)` starting at `at`, if there is one. */
function linkAt(source: string, at: number) {
  const image = source[at] === "!";
  const open = image ? at + 1 : at;
  if (source[open] !== "[") return null;
  const middle = source.indexOf("](", open);
  if (middle < 0) return null;
  const end = source.indexOf(")", middle);
  if (end < 0) return null;
  return {
    image,
    label: source.slice(open + 1, middle),
    target: source.slice(middle + 2, end).trim(),
    end: end + 1,
  };
}

/** Reads the inline marks of one run of text. */
export function parseInline(source: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source.charAt(i);
    if (char === "`") {
      const close = source.indexOf("`", i + 1);
      if (close > i) {
        out.push({ kind: "code", text: source.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    if (char === "[" || char === "!") {
      const link = linkAt(source, i);
      if (link !== null) {
        out.push(
          link.image
            ? { kind: "image", alt: link.label }
            : {
                kind: "link",
                content: parseInline(link.label, depth + 1),
                href: link.target,
              },
        );
        i = link.end;
        continue;
      }
    }
    const rule =
      depth < MAX_DEPTH
        ? EMPHASIS.find((candidate) => source.startsWith(candidate.open, i))
        : undefined;
    if (rule !== undefined) {
      const from = i + rule.open.length;
      const close = source.indexOf(rule.close, from);
      if (close > from) {
        out.push({
          kind: rule.kind,
          content: parseInline(source.slice(from, close), depth + 1),
        });
        i = close + rule.close.length;
        continue;
      }
    }
    pushText(out, char);
    i += 1;
  }
  return out;
}

/** Reads a cell's Markdown into blocks. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const endParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({
        kind: "paragraph",
        content: parseInline(paragraph.join(" ")),
      });
      paragraph = [];
    }
  };
  const endList = () => {
    if (list !== null) blocks.push({ kind: "list", ...list });
    list = null;
  };
  const endAll = () => {
    endParagraph();
    endList();
  };

  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n] ?? "";
    const fence = FENCE.exec(line);
    if (fence !== null) {
      endAll();
      const body: string[] = [];
      n += 1;
      while (n < lines.length && !FENCE.test(lines[n] ?? "")) {
        body.push(lines[n] ?? "");
        n += 1;
      }
      blocks.push({
        kind: "code",
        language: fence[1] === "" ? null : (fence[1] ?? null),
        text: body.join("\n"),
      });
      continue;
    }
    if (line.trim() === "") {
      endAll();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      endAll();
      blocks.push({
        kind: "heading",
        level: heading[1]?.length ?? 1,
        content: parseInline(heading[2] ?? ""),
      });
      continue;
    }
    if (RULE.test(line)) {
      endAll();
      blocks.push({ kind: "rule" });
      continue;
    }
    const item = BULLET.exec(line) ?? NUMBERED.exec(line);
    if (item !== null) {
      endParagraph();
      const ordered = NUMBERED.test(line) && !BULLET.test(line);
      if (list !== null && list.ordered !== ordered) endList();
      list ??= { ordered, items: [] };
      list.items.push(parseInline(item[1] ?? ""));
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote !== null) {
      endAll();
      blocks.push({ kind: "quote", content: parseInline(quote[1] ?? "") });
      continue;
    }
    endList();
    paragraph.push(line.trim());
  }
  endAll();
  return blocks;
}
