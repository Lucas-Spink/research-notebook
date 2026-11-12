import { LockFile } from "@research-notebook/format";

/** A heartbeat this old or older makes the lock stale (spec 5.11, ADR-0022). */
const STALE_MS = 5 * 60 * 1000;

/** Whether the desktop app has a project open, as its lock says. */
export type LockState = "open" | "closed" | "unknown";

/**
 * Reads a project's `.lock` (`undefined` when there is none). A fresh
 * heartbeat means open, and so does one in the future, as the app counts it;
 * a stale one means the app is gone and the lock was left behind. Text that is
 * not a lock, such as one caught partly written, is `unknown` so the caller
 * can keep what it showed rather than flicker.
 */
export function lockState(text: string | undefined, now: Date): LockState {
  if (text === undefined) return "closed";
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "unknown";
  }
  const lock = LockFile.safeParse(value);
  if (!lock.success) return "unknown";
  const age = now.getTime() - Date.parse(lock.data.heartbeat);
  return age >= STALE_MS ? "closed" : "open";
}
