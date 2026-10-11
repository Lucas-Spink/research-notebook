import type { HighlightLanguage } from "./scriptFormats";

export type TokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "builtin";

export type Token = { kind: TokenKind; text: string };

const PYTHON_KEYWORDS = new Set(
  (
    "False None True and as assert async await break class continue def del " +
    "elif else except finally for from global if import in is lambda " +
    "nonlocal not or pass raise return try while with yield match case"
  ).split(" "),
);

const PYTHON_BUILTINS = new Set(
  (
    "print len range int float str bool list dict set tuple type open sum " +
    "min max abs sorted enumerate zip map filter isinstance super self cls"
  ).split(" "),
);

const R_KEYWORDS = new Set(
  (
    "if else repeat while function for next break in TRUE FALSE NULL Inf " +
    "NaN NA NA_integer_ NA_real_ NA_character_ NA_complex_"
  ).split(" "),
);

type Language = {
  keywords: Set<string>;
  builtins: Set<string>;
  identifier: RegExp;
  /** Whether `'''`/`"""` strings exist; R strings span lines whatever their quotes. */
  triple: boolean;
  /** Whether every string may run on to the next line. */
  multiline: boolean;
  /** A word before a quote that makes it part of the string (`r"..."`). */
  stringPrefix: RegExp | null;
  definers: Set<string>;
};

const LANGUAGES: Record<HighlightLanguage, Language> = {
  python: {
    keywords: PYTHON_KEYWORDS,
    builtins: PYTHON_BUILTINS,
    identifier: /[\p{L}_][\p{L}\p{N}_]*/uy,
    triple: true,
    multiline: false,
    stringPrefix: /^(?:[rRbBfFuU]|[rR][bBfF]|[bBfF][rR])$/,
    definers: new Set(["def", "class"]),
  },
  r: {
    keywords: R_KEYWORDS,
    builtins: new Set(),
    identifier: /[\p{L}.][\p{L}\p{N}._]*/uy,
    triple: false,
    multiline: true,
    stringPrefix: null,
    definers: new Set(),
  },
};

const NUMBER =
  /0[xX][0-9a-fA-F_]+[L]?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?[jJL]?/y;

/** The string a line carries into the next one. */
type Open = { quote: string } | null;

function matchAt(pattern: RegExp, text: string, at: number): string | null {
  pattern.lastIndex = at;
  const found = pattern.exec(text);
  return found === null ? null : found[0];
}

/** The index just past the end of a string that began before `from`, or -1. */
function stringEnd(line: string, from: number, quote: string): number {
  let i = from;
  while (i < line.length) {
    if (line[i] === "\\") i += 2;
    else if (line.startsWith(quote, i)) return i + quote.length;
    else i += 1;
  }
  return -1;
}

function push(tokens: Token[], kind: TokenKind, text: string) {
  if (text === "") return;
  const last = tokens.at(-1);
  if (last !== undefined && last.kind === kind && kind === "plain") {
    last.text += text;
  } else {
    tokens.push({ kind, text });
  }
}

function classify(
  language: Language,
  word: string,
  after: string,
  previousWord: string | null,
): TokenKind {
  if (language.keywords.has(word)) return "keyword";
  if (language.builtins.has(word)) return "builtin";
  if (previousWord !== null && language.definers.has(previousWord)) {
    return "function";
  }
  return after.startsWith("(") ? "function" : "plain";
}

/** Reads a string whose opening quote is at `quoteAt`; returns its end and what carries over. */
function startString(
  line: string,
  quoteAt: number,
  language: Language,
): { end: number; open: Open } {
  const char = line.charAt(quoteAt);
  const triple = language.triple && line.startsWith(char.repeat(3), quoteAt);
  const quote = triple ? char.repeat(3) : char;
  const end = stringEnd(line, quoteAt + quote.length, quote);
  if (end >= 0) return { end, open: null };
  // An unclosed string runs to the end of the line, and on to the next if
  // the language lets it.
  return {
    end: line.length,
    open: triple || language.multiline ? { quote } : null,
  };
}

function highlightLine(
  line: string,
  language: Language,
  carried: Open,
): { tokens: Token[]; open: Open } {
  const tokens: Token[] = [];
  let i = 0;
  let open: Open = null;
  let previousWord: string | null = null;

  if (carried !== null) {
    const end = stringEnd(line, 0, carried.quote);
    if (end < 0)
      return {
        tokens: line === "" ? [] : [{ kind: "string", text: line }],
        open: carried,
      };
    push(tokens, "string", line.slice(0, end));
    i = end;
  }

  while (i < line.length) {
    const char = line.charAt(i);
    if (char === "#") {
      push(tokens, "comment", line.slice(i));
      break;
    }
    if (char === '"' || char === "'") {
      const string = startString(line, i, language);
      push(tokens, "string", line.slice(i, string.end));
      open = string.open;
      i = string.end;
      previousWord = null;
      continue;
    }
    const number = matchAt(NUMBER, line, i);
    if (number !== null) {
      push(tokens, "number", number);
      i += number.length;
      previousWord = null;
      continue;
    }
    const word = matchAt(language.identifier, line, i);
    if (word !== null) {
      const next = line.charAt(i + word.length);
      if (
        language.stringPrefix?.test(word) === true &&
        (next === '"' || next === "'")
      ) {
        const string = startString(line, i + word.length, language);
        push(tokens, "string", line.slice(i, string.end));
        open = string.open;
        i = string.end;
        previousWord = null;
        continue;
      }
      push(
        tokens,
        classify(language, word, line.slice(i + word.length), previousWord),
        word,
      );
      previousWord = word;
      i += word.length;
      continue;
    }
    push(tokens, "plain", char);
    if (char !== " " && char !== "\t") previousWord = null;
    i += 1;
  }
  return { tokens, open };
}

/**
 * Splits source lines into coloured tokens. It is a small lexer, not a
 * parser: it only decides colour, and the tokens of a line always join back
 * to that line. A string left open (a triple-quoted Python string, or any R
 * string) carries into the next line.
 */
export function highlightLines(
  lines: readonly string[],
  language: HighlightLanguage | null,
): Token[][] {
  if (language === null) {
    return lines.map((line) =>
      line === "" ? [] : [{ kind: "plain" as const, text: line }],
    );
  }
  const rules = LANGUAGES[language];
  let open: Open = null;
  return lines.map((line) => {
    const result = highlightLine(line, rules, open);
    open = result.open;
    return result.tokens;
  });
}
