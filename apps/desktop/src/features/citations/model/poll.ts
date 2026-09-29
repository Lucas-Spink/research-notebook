import type { commands } from "../../../ipc/bindings";
import { stateForConnection, type ZoteroState } from "./status";

/** The command the status poll calls, so tests can supply a fake with the same shape. */
export type ZoteroApi = Pick<typeof commands, "zoteroStatus">;

/**
 * One check of Zotero's connectivity. A check that fails outright — the
 * command itself erroring, not a normal not-running or disabled answer —
 * reports `unknown` rather than throwing, so a failed poll never raises an
 * alarm; the next one tries again.
 */
export async function fetchZoteroStatus(api: ZoteroApi): Promise<ZoteroState> {
  const result = await api.zoteroStatus();
  return result.status === "ok"
    ? stateForConnection(result.data)
    : { kind: "unknown" };
}
