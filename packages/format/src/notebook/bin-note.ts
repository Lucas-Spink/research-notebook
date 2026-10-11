import { z } from "zod";

/**
 * Where a question or experiment was when it went to the bin, kept beside it
 * in `.trash/` so a restore can put it back in the same place (ADR-0063).
 * `.trash/` is the application's own state, not notebook data: nothing else
 * reads this, and a note that cannot be read only costs the place.
 */
export interface BinNote {
  /** A question's place among the questions shown, or an experiment's under its question. */
  index: number;
  /** For a question, the folders of the experiments binned with it, in the order they were shown. */
  experiments: readonly string[];
}

const NOTE_VERSION = 1;

const Stored = z.object({
  version: z.literal(NOTE_VERSION),
  index: z.number().int().min(0),
  experiments: z.array(z.string().min(1)),
});

/** The text kept beside a binned item. */
export function serialiseBinNote(note: BinNote): string {
  return `${JSON.stringify({ version: NOTE_VERSION, ...note })}\n`;
}

/** The note in `text`, or `null` if it is not one this version wrote. */
export function parseBinNote(text: string): BinNote | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const checked = Stored.safeParse(json);
  if (!checked.success) return null;
  return {
    index: checked.data.index,
    experiments: checked.data.experiments,
  };
}
