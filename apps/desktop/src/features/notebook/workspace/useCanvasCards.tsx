import type { Arranged } from "@research-notebook/format";
import { useMemo, useRef } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import type { CardServices } from "../../canvas";
import { CanvasResultPreview } from "./CanvasResultPreview";
import { resolveResult } from "./model/canvasResults";

/** Opens one result's original: its experiment's folder, the artefact and the version shown. */
export type OpenResult = (
  experimentFolder: string,
  artefactId: string,
  version: number | null,
) => void;

/**
 * What a result card on the canvas needs: finding its result again, drawing it,
 * and opening the original. Shared by the table window's canvas view and the
 * pop-out canvas window, which differ only in what "open" does.
 */
export function useCanvasCards(
  arranged: Arranged | null,
  folder: FolderHandle,
  onOpenResult: OpenResult,
): CardServices {
  // The latest handler, for a click that happens after the cards were last built.
  const openNow = useRef(onOpenResult);
  openNow.current = onOpenResult;
  return useMemo<CardServices>(
    () => ({
      resolve: (node) =>
        arranged === null
          ? { status: "missing", reason: "experiment" }
          : resolveResult(arranged, {
              experimentId: node.experiment_id,
              artefactId: node.artefact_id,
              ...(node.version === undefined ? {} : { version: node.version }),
            }),
      renderPreview: (result, detail) => (
        <CanvasResultPreview folder={folder} result={result} detail={detail} />
      ),
      onOpen: (result) =>
        openNow.current(
          result.experimentFolder,
          result.artefactId,
          result.shownVersion,
        ),
    }),
    [arranged, folder],
  );
}
