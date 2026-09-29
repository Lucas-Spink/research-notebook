import type { ZoteroApi } from "./poll";

export const ok = (data: unknown) => ({ status: "ok", data });
export const failure = (kind: string) => ({ status: "error", error: { kind } });

/** A `zoteroStatus` reply of `connected`, defaulted so most tests need not spell it out. */
const CONNECTED = ok({ kind: "connected", serverId: null });

/** A command API that answers `zoteroStatus` from `reply`, `connected` by default. */
export function fakeApi(reply: unknown = CONNECTED): ZoteroApi {
  const api = { zoteroStatus: () => Promise.resolve(reply) };
  // The fake has the same shape as the generated commands.
  return api as unknown as ZoteroApi;
}
