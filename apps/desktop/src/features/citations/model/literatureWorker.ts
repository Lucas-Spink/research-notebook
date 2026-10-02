import {
  createLiteratureClient,
  type LiteratureClient,
} from "@research-notebook/citations";
import type { LiteratureRenderer } from "./literaturePlan";

let client: LiteratureClient | null = null;

/** Starts the citeproc worker the first time it is needed (spec 6.1). */
async function start(): Promise<LiteratureClient> {
  if (client !== null) return client;
  const { default: CiteprocWorker } =
    await import("@research-notebook/citations/worker-entry?worker");
  client = createLiteratureClient(new CiteprocWorker());
  return client;
}

/**
 * Renders Literature in the citeproc Web Worker. Rejects where there is no
 * Worker (the unit-test DOM), which callers treat as "leave the block alone".
 */
export const workerRenderer: LiteratureRenderer = async (input) => {
  if (typeof Worker === "undefined") throw new Error("no Web Worker here");
  const worker = await start();
  try {
    return await worker.render(input);
  } catch (error) {
    // A crashed worker is replaced on the next request.
    worker.dispose();
    client = null;
    throw error;
  }
};
