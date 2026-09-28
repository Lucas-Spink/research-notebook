import { formatSize } from "../preview";
import { panelMessages as m } from "./messages";
import { candidateKey } from "./model/relink";
import type { Relink } from "./useRelink";

/**
 * Choosing a folder and confirming one of its ranked candidates for a
 * missing linked artefact's new location (FR-EVD-08, ADR-0031 §3). Nothing
 * is applied until a candidate's own "Use this" is pressed.
 */
export function RelinkDialog({ relink }: { relink: Relink }) {
  const { stage } = relink;

  const notes = relink.notes.length > 0 && (
    <div role="status" aria-live="polite">
      <ul>
        {relink.notes.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ul>
      <button type="button" onClick={relink.dismiss}>
        {m.relink.dismiss}
      </button>
    </div>
  );

  if (stage.kind === "closed") return notes || null;

  return (
    <>
      {notes}
      <div role="dialog" aria-label={m.relink.heading}>
        {stage.kind === "pickingFolder" && <p>{m.relink.choosing}</p>}
        {stage.kind === "reviewing" && (
          <>
            <p>{stage.label}</p>
            {stage.candidates.length === 0 ? (
              <p>{m.relink.noCandidates}</p>
            ) : (
              <ul>
                {stage.candidates.map((candidate) => (
                  <li key={candidateKey(candidate)}>
                    {candidate.name} ({formatSize(candidate.size ?? 0)})
                    {candidate.hashMatches && ` — ${m.relink.matches.hash}`}
                    {!candidate.hashMatches &&
                      candidate.sizeMatches &&
                      ` — ${m.relink.matches.size}`}
                    {!candidate.hashMatches &&
                      !candidate.sizeMatches &&
                      candidate.nameMatches &&
                      ` — ${m.relink.matches.name}`}
                    <button
                      type="button"
                      disabled={relink.busy}
                      onClick={() => void relink.confirm(candidate)}
                    >
                      {m.relink.useThis}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <button type="button" onClick={relink.close}>
          {m.relink.close}
        </button>
      </div>
    </>
  );
}
