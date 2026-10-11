import type { BinItem } from "../../../ipc/bindings";
import { assertNever } from "../../../shared/assertNever";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-\d{2}Z(?:-\d+)?$/;

/**
 * When something was binned, from the name of its folder in the bin
 * (`2026-09-21T10-15-00Z`): "21 Sep 2026, 10:15 UTC". A name that is not a
 * stamp is shown as it is.
 */
export function binnedWhen(stamp: string): string {
  const found = STAMP.exec(stamp);
  if (found === null) return stamp;
  const [, year, month, day, hour, minute] = found;
  const name = MONTHS[Number(month) - 1];
  if (name === undefined) return stamp;
  return `${Number(day)} ${name} ${year}, ${hour}:${minute} UTC`;
}

/** What to call an entry: its kind, and a title for it. */
export function describeEntry(entry: BinItem): { kind: string; title: string } {
  switch (entry.kind) {
    case "question":
      return { kind: "Question", title: entry.name.replace(/\.md$/i, "") };
    case "experiment":
      return { kind: "Experiment", title: entry.name };
    case "files":
      return { kind: "Removed files", title: `from ${entry.name}` };
    default:
      return assertNever(entry.kind);
  }
}

/** Newest first. Entries binned in the same second keep the order they came in. */
export function newestFirst(entries: readonly BinItem[]): BinItem[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        (a.entry.stamp < b.entry.stamp
          ? 1
          : a.entry.stamp > b.entry.stamp
            ? -1
            : 0) || a.index - b.index,
    )
    .map(({ entry }) => entry);
}
