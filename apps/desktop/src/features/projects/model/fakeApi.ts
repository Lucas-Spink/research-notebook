import type { Api } from "./flows";

type Call = { command: string; args: unknown[] };

export const ok = (data: unknown) => ({ status: "ok", data });
export const failure = (kind: string) => ({ status: "error", error: { kind } });

/** A command API that records its calls and answers from `replies`. */
export function fakeApi(replies: Partial<Record<string, unknown>> = {}) {
  const calls: Call[] = [];
  const defaults: Record<string, unknown> = {
    appVersion: "0.1.0",
    createProject: ok(null),
    openProject: ok(null),
    openRecentProject: failure("notRemembered"),
    locateProject: ok(null),
    rememberProject: ok(null),
    externalRootStatus: ok([]),
    setExternalRoot: ok(null),
    acquireProjectLock: ok({ kind: "acquired" }),
    projectLockState: ok("held"),
    releaseProjectLock: ok(null),
  };
  const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const command of Object.keys(defaults)) {
    api[command] = (...args) => {
      calls.push({ command, args });
      return Promise.resolve(
        command in replies ? replies[command] : defaults[command],
      );
    };
  }
  return {
    // The fake has the same shape as the generated commands.
    api: api as unknown as Api,
    calls,
    names: () => calls.map((c) => c.command),
  };
}
