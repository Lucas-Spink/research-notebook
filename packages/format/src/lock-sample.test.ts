import { describe, expect, it } from "vitest";
import { LockFile } from "./schema";

/**
 * The text `nb-fs` writes for a lock (S2-T06, ADR-0022). Rust owns the lock
 * because its heartbeat runs without the webview, so this is the guard that
 * it still matches the schema and the JSON layout of format-v1.md 3.5. The
 * same text is asserted byte for byte in
 * `crates/nb-fs/tests/lock/acquire.rs`; change both together.
 */
const RUST_LOCK_TEXT = [
  "{",
  '  "host": "lab-pc",',
  '  "pid": 4242,',
  '  "app_version": "0.1.0",',
  '  "opened": "2026-09-19T10:00:00Z",',
  '  "heartbeat": "2026-09-19T10:00:00Z"',
  "}",
  "",
].join("\n");

describe("the lock file nb-fs writes", () => {
  it("is valid against the LockFile schema", () => {
    const parsed = LockFile.safeParse(JSON.parse(RUST_LOCK_TEXT));
    expect(parsed.success).toBe(true);
  });

  it("has the layout JSON.stringify produces, with a final line feed (format-v1.md 3.5)", () => {
    const parsed = LockFile.parse(JSON.parse(RUST_LOCK_TEXT));
    expect(`${JSON.stringify(parsed, null, 2)}\n`).toBe(RUST_LOCK_TEXT);
  });
});
