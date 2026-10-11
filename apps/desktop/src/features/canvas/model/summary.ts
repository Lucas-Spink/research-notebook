import type { CanvasFileModel } from "@research-notebook/format";
import { artefactNodes, type ArtefactNode } from "./nodes";
import { noteNodes } from "./notes";
import type { ResultInfo } from "./results";

/** A figure a note refers to: the card it is joined to, and what that card points at now. */
export type FigureRef = {
  /** The first card of this figure joined to the note, which a click selects. */
  nodeId: string;
  info: ResultInfo;
};

/** One note of the summary. */
export type NoteSummary = {
  id: string;
  text: string;
  /** The figures it is joined to, each once, in the order the lines were drawn. */
  figures: FigureRef[];
  /** The other notes it is joined to. */
  notes: { id: string; text: string }[];
};

/** The same figure however many cards show it: the result and the version shown. */
function sameFigure(info: ResultInfo, node: ArtefactNode): string {
  return info.status === "found"
    ? `${info.experimentFolder}:${info.artefactId}:${info.shownVersion ?? "-"}`
    : `missing:${node.experiment_id}:${node.artefact_id}:${node.version ?? "-"}`;
}

/**
 * The summary of a question's canvas (ADR-0065): each note, in the order it
 * reads down the canvas, with the figures and notes its lines join it to. A
 * line is read from either end. It is worked out from the canvas each time and
 * stored nowhere, so it cannot disagree with the lines.
 */
export function summarise(
  file: CanvasFileModel,
  resolve: (node: ArtefactNode) => ResultInfo,
): NoteSummary[] {
  const figures = new Map(artefactNodes(file).map((node) => [node.id, node]));
  const notes = new Map(noteNodes(file).map((node) => [node.id, node]));
  return [...notes.values()]
    .sort(
      (a, b) =>
        a.position.y - b.position.y ||
        a.position.x - b.position.x ||
        a.id.localeCompare(b.id),
    )
    .map((note) => {
      const seen = new Set<string>();
      const referred: FigureRef[] = [];
      const related: { id: string; text: string }[] = [];
      for (const edge of file.edges) {
        const other =
          edge.source === note.id
            ? edge.target
            : edge.target === note.id
              ? edge.source
              : null;
        if (other === null) continue;
        const figure = figures.get(other);
        if (figure !== undefined) {
          const info = resolve(figure);
          const key = sameFigure(info, figure);
          if (!seen.has(key)) {
            seen.add(key);
            referred.push({ nodeId: figure.id, info });
          }
          continue;
        }
        const next = notes.get(other);
        if (next !== undefined) related.push({ id: next.id, text: next.text });
      }
      return {
        id: note.id,
        text: note.text,
        figures: referred,
        notes: related,
      };
    });
}
