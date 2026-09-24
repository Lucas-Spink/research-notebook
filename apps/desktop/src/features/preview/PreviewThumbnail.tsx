import { assertNever } from "../../shared/assertNever";
import { previewMessages as m } from "./messages";
import type { Thumbnail, TypeIcon } from "./model/load";
import { PdfThumbnail } from "./PdfViews";
import "./Preview.css";

type Props = {
  /** The artefact's display name, for the accessible label. */
  name: string;
  /** `null` while it loads; the type icon is shown meanwhile. */
  thumbnail: Thumbnail | null;
  /** The icon to show while loading. Defaults to the thumbnail's own. */
  icon?: TypeIcon;
};

function Icon({ name, icon }: { name: string; icon: TypeIcon }) {
  return (
    <span
      className={`preview-thumb__icon preview-thumb__icon--${icon}`}
      role="img"
      aria-label={`${m.types[icon]}: ${name}`}
    >
      {m.types[icon]}
    </span>
  );
}

/**
 * A version's thumbnail (spec 8): Rust's PNG for raster images, the SVG
 * itself through `<img>`, a PDF's first page, or the type icon.
 */
export function PreviewThumbnail({ name, thumbnail, icon = "other" }: Props) {
  if (thumbnail === null) return <Icon name={name} icon={icon} />;
  switch (thumbnail.kind) {
    case "image":
      return (
        <img
          className="preview-thumb__image"
          src={thumbnail.url}
          alt={m.thumbnailAlt(name)}
        />
      );
    case "pdf":
      return (
        <PdfThumbnail
          name={name}
          url={thumbnail.url}
          fallback={<Icon name={name} icon="pdf" />}
        />
      );
    case "icon":
      return <Icon name={name} icon={thumbnail.icon} />;
    default:
      return assertNever(thumbnail);
  }
}
