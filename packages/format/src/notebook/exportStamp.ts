/** The shape of an export's stamp, which `nb-archive` accepts and nothing else. */
export const EXPORT_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/u;

/** The UTC instant to the second, such as `2026-10-11T14:30:05Z`: what an export says it was made at. */
export function exportInstant(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/u, "Z");
}

/**
 * The UTC instant of an export run, to the second, as a name for its folder or
 * file: `2026-10-11T14-30-05Z`. No colons (Windows refuses them), and it sorts
 * in time order. The clock is the caller's, so tests are deterministic.
 */
export function exportStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/u, "Z")
    .replace(/:/gu, "-");
}
