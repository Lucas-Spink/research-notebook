import type { ChosenFile, DiscoveredFileDto } from "../../../../ipc/bindings";

/** Include/exclude globs, one per line, for a textarea (FR-EVD-09). */
export function patternsToText(patterns: readonly string[]): string {
  return patterns.join("\n");
}

/** The reverse of {@link patternsToText}: one pattern per non-blank line. */
export function textToPatterns(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** A stable key for one discovered file, for selection state across a scan's results. */
export function discoveredKey(file: DiscoveredFileDto): string {
  return `${file.location.root}:${file.location.path}`;
}

/** Every discovered file not already captured, selected by default. */
export function defaultSelection(
  files: readonly DiscoveredFileDto[],
): ReadonlySet<string> {
  return new Set(files.filter((file) => !file.captured).map(discoveredKey));
}

/** The selected discovered files, as `addEvidenceFiles` takes them (ADR-0044 point 1). */
export function discoveredToChosenFiles(
  files: readonly DiscoveredFileDto[],
  selected: ReadonlySet<string>,
): ChosenFile[] {
  return files
    .filter((file) => selected.has(discoveredKey(file)))
    .map((file) => ({
      kind: "located",
      name: file.name,
      size: file.size ?? 0,
      location: file.location,
    }));
}
