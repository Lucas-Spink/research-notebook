import { useEffect, useMemo, useRef, useState } from "react";
import type { TextPreview } from "../../ipc/bindings";
import { previewMessages as m } from "./messages";
import {
  findMatches,
  MAX_MATCHES,
  splitByMatches,
  type Match,
  type Part,
} from "./model/codeSearch";
import { highlightLines } from "./model/highlight";
import type { HighlightLanguage } from "./model/scriptFormats";

/** The classes of one piece: its colour, and whether it is a match or the current one. */
function partClass(
  part: Part,
  active: Match | undefined,
  line: number,
  lineMatches: Match[] | undefined,
): string | undefined {
  const classes = part.kind === "plain" ? [] : [`code__${part.kind}`];
  if (part.range !== null) {
    classes.push("code__match");
    const match = lineMatches?.[part.range];
    if (match !== undefined && match === active && active.line === line) {
      classes.push("code__match--current");
    }
  }
  return classes.length === 0 ? undefined : classes.join(" ");
}

type Props = {
  name: string;
  text: TextPreview;
  language: HighlightLanguage | null;
  /** Opens the original file in the system's own application. */
  onOpenExternally: () => void;
};

/**
 * A script as source code: highlighted, numbered, searchable and read-only
 * (issue #104). It only ever shows text. Nothing in it is run, and the
 * markup is built from React elements, so the script cannot add any.
 */
export function CodeView({ name, text, language, onOpenExternally }: Props) {
  const [wrap, setWrap] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const body = useRef<HTMLDivElement>(null);

  const tokens = useMemo(
    () => highlightLines(text.lines, language),
    [text.lines, language],
  );
  const matches = useMemo(
    () => findMatches(text.lines, query),
    [text.lines, query],
  );
  const byLine = useMemo(() => {
    const grouped = new Map<number, typeof matches>();
    for (const match of matches) {
      grouped.set(match.line, [...(grouped.get(match.line) ?? []), match]);
    }
    return grouped;
  }, [matches]);
  const active = matches[current];

  // A new query starts at its first match.
  useEffect(() => setCurrent(0), [query]);
  useEffect(() => {
    if (active === undefined) return;
    body.current
      ?.querySelector(`[data-line="${active.line}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const step = (by: number) =>
    setCurrent((i) =>
      matches.length === 0 ? 0 : (i + by + matches.length) % matches.length,
    );
  const languageName = m.code.languages[language ?? "plain"];

  return (
    <div className="code">
      <div className="code__head">
        <strong className="code__name">{name}</strong>
        <span className="code__meta">
          {languageName} · {m.code.lines(text.lines.length)} · {m.code.readOnly}
        </span>
        <button type="button" onClick={onOpenExternally}>
          {m.code.openExternally}
        </button>
      </div>
      <div className="code__tools" role="search">
        <input
          type="search"
          aria-label={m.code.search}
          placeholder={m.code.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              step(event.shiftKey ? -1 : 1);
            }
          }}
        />
        <button
          type="button"
          disabled={matches.length === 0}
          onClick={() => step(-1)}
        >
          {m.code.previous}
        </button>
        <button
          type="button"
          disabled={matches.length === 0}
          onClick={() => step(1)}
        >
          {m.code.next}
        </button>
        <span role="status" aria-live="polite" className="code__count">
          {query === ""
            ? ""
            : matches.length === 0
              ? m.code.noMatches
              : m.code.matches(
                  current + 1,
                  matches.length,
                  matches.length >= MAX_MATCHES,
                )}
        </span>
        <label className="code__wrap">
          <input
            type="checkbox"
            checked={wrap}
            onChange={(event) => setWrap(event.target.checked)}
          />
          {m.code.wrap}
        </label>
      </div>
      <div
        ref={body}
        className={`code__body${wrap ? " code__body--wrap" : ""}`}
        role="region"
        aria-label={m.code.label(name)}
        tabIndex={0}
      >
        {text.lines.length === 0 && (
          <p className="preview__note">{m.code.empty}</p>
        )}
        {tokens.map((lineTokens, index) => (
          <div className="code__row" key={index} data-line={index}>
            <span className="code__no" aria-hidden="true">
              {index + 1}
            </span>
            <code className="code__line">
              {splitByMatches(lineTokens, byLine.get(index) ?? []).map(
                (part, i) => (
                  <span
                    key={i}
                    className={partClass(
                      part,
                      active,
                      index,
                      byLine.get(index),
                    )}
                  >
                    {part.text}
                  </span>
                ),
              )}
            </code>
          </div>
        ))}
      </div>
      {!text.complete && (
        <p className="preview__note">{m.code.truncated(text.lines.length)}</p>
      )}
      {text.encoding !== "utf8" && (
        <p className="preview__note">
          {m.table.encoding(m.encoding[text.encoding])}
        </p>
      )}
    </div>
  );
}
