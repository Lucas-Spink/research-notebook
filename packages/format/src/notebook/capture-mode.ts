/** Spec 7.4 FR-EVD-02: files at or below the project's copy threshold are
 * copied; larger files are linked. */
export type CaptureMode = "copy" | "link";

/**
 * Decides copy or link mode for one file (FR-EVD-02): at or below
 * `copyThresholdMb` copies, above it links, and a threshold of `0` links
 * every file, however small (format-v1.md 4.1's `0` special case) —
 * without it, a zero-byte file would always be "at or below" a zero
 * threshold and copy regardless. `override` decides for this one capture
 * without changing the project's default.
 */
export function decideCaptureMode(
  sizeBytes: number,
  copyThresholdMb: number,
  override?: CaptureMode,
): CaptureMode {
  if (override !== undefined) return override;
  if (copyThresholdMb === 0) return "link";
  const thresholdBytes = copyThresholdMb * 1024 * 1024;
  return sizeBytes <= thresholdBytes ? "copy" : "link";
}
