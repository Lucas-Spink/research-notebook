import { useRef, useState } from "react";
import {
  CitationPicker,
  SourceDetailsPanel,
  SourcesPanel,
  sourcesMessages,
  type RepairModel,
} from "../../citations";
import type { SourceAttach } from "./useSourceAttach";

type Props = {
  repair: RepairModel;
  attach: SourceAttach;
};

/**
 * The Sources tab of the side pane (S6-T01): every project source with
 * search, its details when one is selected, the Zotero, DOI and PDF actions,
 * and attach and detach for the selected experiment. Sources not yet in the
 * project are found in Zotero with the citation picker and attached in one go.
 */
export function SourcesPane({ repair, attach }: Props) {
  const [picking, setPicking] = useState(false);
  // The picker reports the composed text, then the citekeys; both are needed to attach.
  const composed = useRef("");
  return (
    <div className="sources-pane">
      {attach.model === undefined ? (
        <p>{sourcesMessages.noExperiment}</p>
      ) : (
        <p>
          {sourcesMessages.attachTo} <strong>{attach.model.target}</strong>{" "}
          <button
            type="button"
            disabled={attach.model.busy}
            onClick={() => setPicking(true)}
          >
            {sourcesMessages.attachFromZotero}
          </button>
        </p>
      )}
      {attach.failed && <p role="alert">{sourcesMessages.attachFailed}</p>}
      {picking && attach.model !== undefined && (
        <CitationPicker
          onInsert={(markdown) => {
            composed.current = markdown;
          }}
          onInsertCitekeys={(citekeys) => {
            setPicking(false);
            void attach.attachPicked(composed.current, citekeys);
          }}
          onCancel={() => setPicking(false)}
        />
      )}
      <SourcesPanel
        repair={repair}
        {...(attach.model ? { attach: attach.model } : {})}
      />
      <SourceDetailsPanel />
    </div>
  );
}
