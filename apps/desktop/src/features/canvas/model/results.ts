import type { ARTEFACT_TYPES } from "@research-notebook/format";
import type { ArtefactNode } from "./nodes";

/** What a result card shows about the result it points at, found in the notebook as it is now. */
export type FoundResult = {
  status: "found";
  artefactId: string;
  name: string;
  type: (typeof ARTEFACT_TYPES)[number];
  experimentRef: string;
  experimentTitle: string;
  /** The experiment's folder name, which the preview of its files is found by. */
  experimentFolder: string;
  mode: "copy" | "link";
  /** The version the card shows: the one pinned, or `null` for a linked result, which has none. */
  shownVersion: number | null;
  /** The newest version there is, or `null` for a linked result. */
  latestVersion: number | null;
  /** The file previewed: the shown version's, relative to the experiment folder, or the linked file's name. */
  fileName: string;
  sha256: string;
  /** Whether the file is a copy kept in the notebook. */
  captured: boolean;
};

/** A card whose result cannot be found. The card stays and says why; nothing is deleted. */
export type MissingResult = {
  status: "missing";
  reason: "experiment" | "artefact" | "version";
};

/** How much of the file a card's picture is drawn from: small cards use the cached thumbnail, large ones the file itself. */
export type PictureDetail = "thumbnail" | "full";

export type ResultInfo = FoundResult | MissingResult;

/** What the rest of the application provides so a card can be drawn (the canvas knows nothing of experiments or previews). */
export type CardServices = {
  resolve: (node: ArtefactNode) => ResultInfo;
  /** The picture of a result. */
  renderPreview: (
    result: FoundResult,
    detail: PictureDetail,
  ) => React.ReactNode;
  /** Opens the original in the preview pane. */
  onOpen: (result: FoundResult, node: ArtefactNode) => void;
  /** The card was clicked: the writing beside the canvas follows its experiment. */
  onSelect: (result: FoundResult) => void;
};
