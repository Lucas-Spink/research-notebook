import { useMemo } from "react";
import { commands, type FolderHandle } from "../../../ipc/bindings";
import type { FoundResult } from "../../canvas";
import {
  planPreview,
  PreviewThumbnail,
  useThumbnail,
  versionPath,
} from "../../preview";

type Props = {
  folder: FolderHandle;
  result: FoundResult;
};

/**
 * The picture on a canvas card: the result's thumbnail (spec 8), from the
 * cache that the table's previews use, never the full-size file. A linked
 * result outside the notebook shows its type icon.
 */
export function CanvasResultPreview({ folder, result }: Props) {
  const plan = useMemo(
    () =>
      planPreview({
        fileName: result.fileName,
        type: result.type,
        captured: result.captured,
      }),
    [result.fileName, result.type, result.captured],
  );
  const thumbnail = useThumbnail({
    api: commands,
    target: {
      folder,
      file: versionPath(result.experimentFolder, result.fileName),
      sha256: result.sha256,
    },
    plan,
  });
  return <PreviewThumbnail name={result.name} thumbnail={thumbnail} />;
}
