import { previewMessages as m } from "./messages";
import type { PreviewApi, PreviewTarget } from "./model/load";
import type { PreviewPlan } from "./model/plan";
import { PdfThumbnail } from "./PdfViews";
import { PreviewThumbnail } from "./PreviewThumbnail";
import { usePreview, useThumbnail } from "./usePreview";

/**
 * How much of a file a picture is drawn from: the cached 256 px thumbnail
 * (cheap, for something small on screen), or the file itself (for something
 * big enough to read).
 */
export type PictureDetail = "thumbnail" | "full";

type Props = {
  api: PreviewApi;
  target: PreviewTarget;
  plan: PreviewPlan;
  /** The result's name, for the accessible label. */
  name: string;
  detail: PictureDetail;
};

/** A PDF's first page is drawn this long on its longest edge at full detail. */
const FULL_PDF_EDGE = 1280;

/** The file itself, with the thumbnail as the fallback while it loads or if it cannot be drawn. */
function FullPicture({
  api,
  target,
  plan,
  name,
  fallback,
}: Omit<Props, "detail"> & { fallback: React.ReactNode }) {
  const { state } = usePreview({ api, target, plan });
  if (state.status !== "ready") return <>{fallback}</>;
  const { content } = state;
  if (content.kind === "image" || content.kind === "svg") {
    return (
      <img
        className="preview-thumb__image"
        src={content.url}
        alt={m.thumbnailAlt(name)}
        decoding="async"
        loading="lazy"
      />
    );
  }
  if (content.kind === "pdf") {
    return (
      <PdfThumbnail
        name={name}
        url={content.url}
        maxEdge={FULL_PDF_EDGE}
        fallback={fallback}
      />
    );
  }
  return <>{fallback}</>;
}

/**
 * A result's picture (spec 8) at the detail asked for. Only rasters, SVGs and
 * PDFs have more to show at full detail; every other kind is its type icon at
 * either, and reads nothing.
 */
export function PreviewPicture({ api, target, plan, name, detail }: Props) {
  const thumbnail = useThumbnail({ api, target, plan });
  const small = <PreviewThumbnail name={name} thumbnail={thumbnail} />;
  const hasMore =
    plan.kind === "image" || plan.kind === "svg" || plan.kind === "pdf";
  if (detail === "thumbnail" || !hasMore) return small;
  return (
    <FullPicture
      api={api}
      target={target}
      plan={plan}
      name={name}
      fallback={small}
    />
  );
}
