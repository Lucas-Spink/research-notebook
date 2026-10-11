import { useMemo, useState } from "react";
import type { NotebookPreview } from "../../ipc/bindings";
import { assertNever } from "../../shared/assertNever";
import { NotebookView, type FileDetails } from "./DetailViews";
import { MarkdownView } from "./MarkdownView";
import { previewMessages as m } from "./messages";
import { highlightLines } from "./model/highlight";
import { parseMarkdown } from "./model/markdown";
import type {
  NotebookCell,
  NotebookDoc,
  NotebookOutput,
  NotebookProblem,
} from "./model/notebook";
import type { HighlightLanguage } from "./model/scriptFormats";

function languageOf(name: string | null): HighlightLanguage | null {
  const lower = name?.toLowerCase();
  return lower === "python" || lower === "r" ? lower : null;
}

/** Source lines coloured, without line numbers. */
function Source({
  source,
  language,
}: {
  source: string;
  language: HighlightLanguage | null;
}) {
  const lines = useMemo(
    () => highlightLines(source.split("\n"), language),
    [source, language],
  );
  return (
    <pre className="cell__source">
      <code>
        {lines.map((tokens, i) => (
          <span key={i} className="cell__line">
            {tokens.map((token, j) => (
              <span
                key={j}
                className={
                  token.kind === "plain" ? undefined : `code__${token.kind}`
                }
              >
                {token.text}
              </span>
            ))}
            {"\n"}
          </span>
        ))}
      </code>
    </pre>
  );
}

function OutputView({ output }: { output: NotebookOutput }) {
  switch (output.kind) {
    case "text":
      return (
        <>
          <pre
            className={`cell__output${output.stream === "stderr" ? " cell__output--stderr" : ""}`}
          >
            {output.text}
          </pre>
          {output.cut && <p className="preview__note">{m.cells.cut}</p>}
        </>
      );
    case "error":
      return (
        <>
          <pre className="cell__output cell__output--error">
            {`${output.name}: ${output.value}\n${output.traceback}`.trim()}
          </pre>
          {output.cut && <p className="preview__note">{m.cells.cut}</p>}
        </>
      );
    case "image":
      return <p className="preview__note">{m.cells.image(output.mime)}</p>;
    case "html":
      return <p className="preview__note">{m.cells.html}</p>;
    case "unsupported":
      return (
        <p className="preview__note">{m.cells.unsupported(output.mime)}</p>
      );
    default:
      return assertNever(output);
  }
}

function CellBody({
  cell,
  language,
}: {
  cell: NotebookCell;
  language: HighlightLanguage | null;
}) {
  const blocks = useMemo(
    () => (cell.kind === "markdown" ? parseMarkdown(cell.source) : []),
    [cell],
  );
  switch (cell.kind) {
    case "markdown":
      return <MarkdownView blocks={blocks} />;
    case "raw":
      return <pre className="cell__source">{cell.source}</pre>;
    case "code":
      return (
        <>
          <Source source={cell.source} language={language} />
          {cell.outputs.map((output, i) => (
            <OutputView key={i} output={output} />
          ))}
        </>
      );
    default:
      return assertNever(cell);
  }
}

type CellsProps = {
  details: FileDetails;
  info: NotebookPreview;
  notebook: NotebookDoc;
  onOpenExternally: () => void;
};

/**
 * A Jupyter notebook as its saved cells: Markdown formatted, code coloured,
 * and the outputs the file already holds (issue #104). Each cell can be
 * folded. Nothing is run, and output that could carry script is not drawn.
 */
export function NotebookCells({
  details,
  info,
  notebook,
  onOpenExternally,
}: CellsProps) {
  const [folded, setFolded] = useState<ReadonlySet<number>>(new Set());
  const language = languageOf(notebook.language ?? info.language);
  const toggle = (index: number) =>
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  return (
    <div className="cells">
      <div className="code__head">
        <strong className="code__name">{details.name}</strong>
        <span className="code__meta">
          {m.notebook.kinds[info.kind]} ·{" "}
          {m.cells.summary(notebook.cells.length)} · {m.cells.readOnly}
        </span>
        <button type="button" onClick={onOpenExternally}>
          {m.code.openExternally}
        </button>
      </div>
      <div className="code__tools">
        <button
          type="button"
          onClick={() => setFolded(new Set(notebook.cells.keys()))}
        >
          {m.cells.collapseAll}
        </button>
        <button type="button" onClick={() => setFolded(new Set())}>
          {m.cells.expandAll}
        </button>
      </div>
      <ol className="cells__list" aria-label={m.cells.label(details.name)}>
        {notebook.cells.map((cell, index) => {
          const isFolded = folded.has(index);
          const number = index + 1;
          return (
            <li key={index} className={`cell cell--${cell.kind}`}>
              <div className="cell__bar">
                <button
                  type="button"
                  aria-expanded={!isFolded}
                  aria-label={
                    isFolded ? m.cells.expand(number) : m.cells.collapse(number)
                  }
                  onClick={() => toggle(index)}
                >
                  {isFolded ? "▸" : "▾"}
                </button>
                <span className="cell__kind">{m.cells.kinds[cell.kind]}</span>
                {cell.kind === "code" && (
                  <span className="cell__prompt">
                    {m.cells.input(cell.executionCount)}
                  </span>
                )}
              </div>
              {!isFolded && <CellBody cell={cell} language={language} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type ProblemProps = {
  details: FileDetails;
  info: NotebookPreview;
  problem: NotebookProblem | "tooLarge";
  onOpenInVsCode: () => void;
};

/** A notebook whose cells cannot be shown: why, and its details instead. */
export function NotebookProblemView({
  details,
  info,
  problem,
  onOpenInVsCode,
}: ProblemProps) {
  return (
    <div className="cells">
      <p role="alert">{m.cells.problems[problem]}</p>
      <NotebookView
        details={details}
        notebook={info}
        onOpenInVsCode={onOpenInVsCode}
      />
    </div>
  );
}
