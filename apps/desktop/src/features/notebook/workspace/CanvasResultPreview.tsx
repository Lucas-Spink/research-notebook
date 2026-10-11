import { useMemo } from "react";
import { commands, type FolderHandle } from "../../../ipc/bindings";
import type { FoundResult } from "../../canvas";
import {
  planPreview,
  PreviewPicture,
  versionPath,
  type PictureDetail,
} from "../../preview";

type Props = {
  folder: FolderHandle;
  result: FoundResult;
  /** The cached thumbnail for something small on screen, the file itself for something large. */
  detail: PictureDetail;
};

/**
 * The picture on a canvas card. A small card shows the result's cached
 * thumbnail (spec 8), the same one the table uses; a card big enough to read
 * shows the file itself, which the application serves to the window directly.
 * A linked result outside the notebook shows its type icon.
 */
export function CanvasResultPreview({ folder, result, detail }: Props) {
  const plan = useMemo(
    () =>
      planPreview({
        fileName: result.fileName,
        type: result.type,
        captured: result.captured,
      }),
    [result.fileName, result.type, result.captured],
  );
  return (
    <PreviewPicture
      api={commands}
      target={{
        folder,
        file: versionPath(result.experimentFolder, result.fileName),
        sha256: result.sha256,
      }}
      plan={plan}
      name={result.name}
      detail={detail}
    />
  );
}
