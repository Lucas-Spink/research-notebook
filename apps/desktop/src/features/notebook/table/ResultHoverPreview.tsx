import { useMemo } from "react";
import { createPortal } from "react-dom";
import { commands, type FolderHandle } from "../../../ipc/bindings";
import {
  planPreview,
  PreviewThumbnail,
  usePreview,
  useThumbnail,
  versionPath,
} from "../../preview";
import { tableMessages } from "../messages";

/** What the preview needs of a captured result: its latest version. */
export type HoverTarget = {
  name: string;
  type: Parameters<typeof planPreview>[0]["type"];
  /** The version's file, relative to the experiment folder. */
  file: string;
  sha256: string;
};

type Props = {
  folder: FolderHandle;
  experimentFolder: string;
  target: HoverTarget;
  /** The row being hovered; the preview sits beside it. */
  anchor: DOMRect;
  onEnter: () => void;
  onLeave: () => void;
};

const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 360;
const MARGIN = 12;

/** Where the preview goes: beside the row, kept inside the window. */
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

/**
 * The larger, temporary picture of a result while its row is hovered (FR-TBL-06):
 * the image itself where there is one, else the thumbnail enlarged. It is drawn
 * into the page body, so it floats over the table and never changes a row's height.
 */
export function ResultHoverPreview({
  folder,
  experimentFolder,
  target,
  anchor,
  onEnter,
  onLeave,
}: Props) {
  const plan = useMemo(
    () =>
      planPreview({ fileName: target.file, type: target.type, captured: true }),
    [target.file, target.type],
  );
  const source = {
    folder,
    file: versionPath(experimentFolder, target.file),
    sha256: target.sha256,
  };
  const preview = usePreview({ api: commands, target: source, plan });
  const small = useThumbnail({ api: commands, target: source, plan });
  const content =
    preview.state.status === "ready" ? preview.state.content : null;
  const url =
    content?.kind === "image" || content?.kind === "svg" ? content.url : null;
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
      <div className="wtable__hover-name">{target.name}</div>
      {url !== null ? (
        <img
          className="wtable__hover-image"
          src={url}
          alt={tableMessages.largePreviewAlt(target.name)}
        />
      ) : (
        <div className="wtable__hover-image wtable__hover-image--thumb">
          <PreviewThumbnail name={target.name} thumbnail={small} />
        </div>
      )}
    </div>,
    document.body,
  );
}
