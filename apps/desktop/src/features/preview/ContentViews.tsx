import { useRef, useState } from "react";
import type { TablePreview, TextPreview } from "../../ipc/bindings";
import { previewMessages as m } from "./messages";

type ImageProps = {
  name: string;
  url: string;
  zoomed: boolean;
  onToggleZoom: () => void;
  onRenderFailed: () => void;
};

const ZOOM_STEP = 1.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;

/**
 * A raster image fitted to the panel, with a toggle to actual size (spec 8),
 * and zoom in and out (S6-T01): a zoomed image is larger than its frame, and
 * is panned by dragging it or with the scroll bars. Ctrl and the wheel zoom
 * too.
 */
export function ImageView({
  name,
  url,
  zoomed,
  onToggleZoom,
  onRenderFailed,
}: ImageProps) {
  // 1 is the size the toggle chose; zooming multiplies it.
  const [scale, setScale] = useState(1);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const zoomBy = (factor: number) =>
    setScale((current) =>
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current * factor)),
    );
  const magnified = scale !== 1;
  return (
    <div className="preview__image-frame">
      <div className="preview__zoom">
        <button type="button" aria-pressed={zoomed} onClick={onToggleZoom}>
          {zoomed ? m.fitToPanel : m.actualSize}
        </button>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)}>
          {m.zoomIn}
        </button>
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)}>
          {m.zoomOut}
        </button>
        <button type="button" disabled={!magnified} onClick={() => setScale(1)}>
          {m.resetZoom}
        </button>
      </div>
      <div
        className={`preview__scroll${magnified ? " preview__scroll--pan" : ""}`}
        onWheel={(event) => {
          if (event.ctrlKey)
            zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
        }}
        onPointerDown={(event) => {
          if (!magnified) return;
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const from = drag.current;
          if (from === null) return;
          event.currentTarget.scrollLeft -= event.clientX - from.x;
          event.currentTarget.scrollTop -= event.clientY - from.y;
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <img
          className={`preview__image preview__image--${magnified ? "actual" : zoomed ? "actual" : "fit"}`}
          style={magnified ? { width: `${scale * 100}%` } : undefined}
          src={url}
          alt={m.imageAlt(name)}
          draggable={false}
          onError={onRenderFailed}
        />
      </div>
    </div>
  );
}

type SvgProps = { name: string; url: string; onRenderFailed: () => void };

/**
 * An SVG, only ever as the source of an `<img>`, which never runs the
 * scripts an SVG may carry (spec 6.7). Its markup never enters the page.
 */
export function SvgView({ name, url, onRenderFailed }: SvgProps) {
  return (
    <img
      className="preview__image preview__image--fit"
      src={url}
      alt={m.imageAlt(name)}
      onError={onRenderFailed}
    />
  );
}

type TableProps = {
  name: string;
  table: TablePreview;
  expanded: boolean;
  onExpand: () => void;
};

/** The header and first rows of a delimited table (spec 8). */
export function TableView({ name, table, expanded, onExpand }: TableProps) {
  return (
    <div className="preview__table-frame">
      <div className="preview__scroll">
        <table className="preview__table">
          <caption>{m.table.caption(name)}</caption>
          <thead>
            <tr>
              {table.header.map((cell, i) => (
                <th key={i} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="preview__note">
        {table.dimensions === null
          ? m.table.notCounted
          : m.table.dimensions(table.dimensions.rows, table.dimensions.columns)}
      </p>
      {table.moreRows && (
        <p className="preview__note">{m.table.showing(table.rows.length)}</p>
      )}
      {table.moreColumns && (
        <p className="preview__note">{m.table.moreColumns}</p>
      )}
      {table.encoding !== "utf8" && (
        <p className="preview__note">
          {m.table.encoding(m.encoding[table.encoding])}
        </p>
      )}
      {table.moreRows && !expanded && (
        <button type="button" onClick={onExpand}>
          {m.table.expand}
        </button>
      )}
    </div>
  );
}

type TextProps = { name: string; text: TextPreview };

/** The first lines of a script or text file, monospaced (spec 8). */
export function TextView({ name, text }: TextProps) {
  return (
    <div className="preview__text-frame">
      <pre
        className="preview__text"
        aria-label={m.text.label(name)}
        tabIndex={0}
      >
        {text.lines.join("\n")}
      </pre>
      {!text.complete && <p className="preview__note">{m.text.truncated}</p>}
      {text.encoding !== "utf8" && (
        <p className="preview__note">
          {m.table.encoding(m.encoding[text.encoding])}
        </p>
      )}
    </div>
  );
}
