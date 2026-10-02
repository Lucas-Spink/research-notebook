import { renderLiterature } from "./literature";
import type { LiteratureInput, LiteratureResult } from "./literature";

/** One render, tagged so overlapping requests can be told apart. */
export interface LiteratureRequest {
  id: number;
  input: LiteratureInput;
}

export interface LiteratureReply {
  id: number;
  result: LiteratureResult;
}

/**
 * The worker's side of the channel: a `DedicatedWorkerGlobalScope`, or any
 * port with the same two members. Declared here rather than taken from the
 * `webworker` lib so this package keeps its small ambient type surface.
 */
export interface WorkerScopeLike {
  onmessage: ((event: { data: LiteratureRequest }) => void) | null;
  postMessage(reply: LiteratureReply): void;
}

/**
 * Answers every request on `scope` with `renderLiterature` (spec 6.1:
 * citeproc-js in a Web Worker). Each render is self-contained, so the worker
 * holds no state between requests and a failing style cannot poison the next
 * one (ADR-0012).
 */
export function attachLiteratureWorker(scope: WorkerScopeLike): void {
  scope.onmessage = (event) => {
    const { id, input } = event.data;
    scope.postMessage({ id, result: renderLiterature(input) });
  };
}
