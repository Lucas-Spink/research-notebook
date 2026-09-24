import { useEffect, useState } from "react";
import type { FolderHandle } from "../../ipc/bindings";
import type { AvailabilityState } from "./model/availability";
import type { PanelApi } from "./model/api";

type Source = { root: string; path: string };

type Options = {
  api: PanelApi;
  folder: FolderHandle;
  projectId: string;
  /** `undefined` for a copy-mode artefact, which has nothing to check. */
  source: Source | undefined;
  /** Bumped to check again, for a "recheck" action. */
  attempt: number;
};

/**
 * A link-mode artefact's live availability (FR-EVD-07, FR-EVD-08): checked
 * on mount and whenever `source` or `attempt` changes, never read from a
 * stored flag (ADR-0031 §1). `undefined` while there is nothing to check.
 */
export function useAvailability({
  api,
  folder,
  projectId,
  source,
  attempt,
}: Options): AvailabilityState | undefined {
  const [state, setState] = useState<AvailabilityState | undefined>(undefined);

  useEffect(() => {
    if (source === undefined) {
      setState(undefined);
      return;
    }
    let live = true;
    setState({ status: "checking" });
    void api
      .linkedArtefactAvailability(folder, projectId, source.root, source.path)
      .then((result) => {
        if (!live) return;
        setState(
          result.status === "ok"
            ? { status: "checked", availability: result.data }
            : { status: "failed" },
        );
      })
      .catch(() => {
        if (live) setState({ status: "failed" });
      });
    return () => {
      live = false;
    };
  }, [api, folder, projectId, source?.root, source?.path, attempt]);

  return state;
}
