import { useEffect, useState } from "react";
import { commands } from "../../ipc/bindings";
import { fetchZoteroStatus } from "./model/poll";
import type { ZoteroState } from "./model/status";

/**
 * How often Zotero's connectivity is checked again, so enabling the local
 * API or starting Zotero is picked up without restarting the application.
 * Matches the cadence of the project lock check (`useProjects`).
 */
const POLL_MS = 30_000;

/**
 * Zotero's connectivity (FR-CIT-01), checked once on mount and again every
 * `POLL_MS`. `null` until the first check answers.
 */
export function useZoteroStatus(): ZoteroState | null {
  const [state, setState] = useState<ZoteroState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetchZoteroStatus(commands)
        .then((next) => {
          if (!cancelled) setState(next);
        })
        // An unexpected rejection (not the normal typed-error path, which
        // fetchZoteroStatus already turns into "unknown") is no cause for
        // alarm either: the next poll tries again.
        .catch(() => {
          if (!cancelled) setState({ kind: "unknown" });
        });
    };
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return state;
}
