import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FolderHandle } from "../../../ipc/bindings";
import { commands } from "../../../ipc/bindings";
import {
  planPreview,
  PreviewThumbnail,
  usePreview,
  useThumbnail,
  versionPath,
} from "../../preview";
import { tableMessages } from "../messages";
import type { ResultsThumbnail } from "./model/resultsSummary";

type Props = {
  folder: FolderHandle;
  experimentFolder: string;
  thumb: ResultsThumbnail;
  /** Double-clicking the thumbnail opens the result in the side pane. */
  onOpen: () => void;
};

/** The pointer may cross the gap between a thumbnail and its preview without the preview closing. */
const HIDE_DELAY_MS = 150;
const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 360;
const MARGIN = 12;

/** Where the preview goes: beside the thumbnail, kept inside the window. */
function placement(anchor: DOMRect): { left: number; top: number } {
  const room = window.innerWidth - anchor.right - MARGIN;
  const left =
    room >= PREVIEW_WIDTH
      ? anchor.right + MARGIN
      : Math.max(MARGIN, anchor.left - PREVIEW_WIDTH - MARGIN);
  const top = Math.min(
    Math.max(MARGIN, anchor.top),
    Math.max(MARGIN, window.innerHeight - PREVIEW_HEIGHT - MARGIN),
  );
  return { left, top };
}

/** The larger, temporary picture of a result: the image itself where there is one, else the thumbnail enlarged. */
function HoverPreview({
  folder,
  experimentFolder,
  thumb,
  anchor,
  onEnter,
  onLeave,
}: Omit<Props, "onOpen"> & {
  anchor: DOMRect;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const plan = useMemo(
    () =>
      planPreview({ fileName: thumb.file, type: thumb.type, captured: true }),
    [thumb.file, thumb.type],
  );
  const target = {
    folder,
    file: versionPath(experimentFolder, thumb.file),
    sha256: thumb.sha256,
  };
  const preview = usePreview({ api: commands, target, plan });
  const small = useThumbnail({ api: commands, target, plan });
  const content =
    preview.state.status === "ready" ? preview.state.content : null;
  const url =
    content?.kind === "image" || content?.kind === "svg" ? content.url : null;
  // Rendered into the body: a table row's transform would make a fixed box relative to the row.
  return createPortal(
    <div
      role="tooltip"
      className="wtable__hover"
      style={{
        ...placement(anchor),
        maxWidth: PREVIEW_WIDTH,
        maxHeight: PREVIEW_HEIGHT,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="wtable__hover-name">{thumb.name}</div>
      {url !== null ? (
        <img
          className="wtable__hover-image"
          src={url}
          alt={tableMessages.largePreviewAlt(thumb.name)}
        />
      ) : (
        <div className="wtable__hover-image wtable__hover-image--thumb">
          <PreviewThumbnail name={thumb.name} thumbnail={small} />
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * A result's latest version, drawn small (spec 8). Hovering it shows a larger
 * preview beside it; double-clicking opens the result in the side pane
 * (S6-T01). A single click is kept from opening the Results cell, since that
 * would replace the thumbnail before the second click could land.
 */
export function ResultThumb({
  folder,
  experimentFolder,
  thumb,
  onOpen,
}: Props) {
  const plan = useMemo(
    () =>
      planPreview({ fileName: thumb.file, type: thumb.type, captured: true }),
    [thumb.file, thumb.type],
  );
  const thumbnail = useThumbnail({
    api: commands,
    target: {
      folder,
      file: versionPath(experimentFolder, thumb.file),
      sha256: thumb.sha256,
    },
    plan,
  });
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const node = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const hideSoon = () => {
    cancelHide();
    timer.current = setTimeout(() => setAnchor(null), HIDE_DELAY_MS);
  };
  useEffect(() => cancelHide, []);

  return (
    <span
      ref={node}
      className="wtable__thumb"
      title={tableMessages.thumbHint}
      onMouseEnter={() => {
        cancelHide();
        const rect = node.current?.getBoundingClientRect();
        if (rect !== undefined) setAnchor(rect);
      }}
      onMouseLeave={hideSoon}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        cancelHide();
        setAnchor(null);
        onOpen();
      }}
    >
      <PreviewThumbnail name={thumb.name} thumbnail={thumbnail} />
      {anchor !== null && (
        <HoverPreview
          folder={folder}
          experimentFolder={experimentFolder}
          thumb={thumb}
          anchor={anchor}
          onEnter={cancelHide}
          onLeave={hideSoon}
        />
      )}
    </span>
  );
}
