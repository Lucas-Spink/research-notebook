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
 * A message handler typed as a method, so a DOM `Worker` (whose handlers take
 * a full `MessageEvent`) and a plain port both fit it. What arrives is
 * `unknown` and is checked before it is used.
 */
export type MessageHandler = {
  handle(event: { data: unknown }): void;
}["handle"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Whether `data` has the shape of a request; the worker answers nothing else. */
export function isLiteratureRequest(data: unknown): data is LiteratureRequest {
  return (
    isObject(data) &&
    typeof data.id === "number" &&
    isObject(data.input) &&
    Array.isArray(data.input.clusters) &&
    Array.isArray(data.input.items) &&
    typeof data.input.styleXml === "string" &&
    typeof data.input.localeXml === "string"
  );
}

/** Whether `data` has the shape of a reply. */
export function isLiteratureReply(data: unknown): data is LiteratureReply {
  return isObject(data) && typeof data.id === "number" && isObject(data.result);
}

/**
 * The worker's side of the channel: a `DedicatedWorkerGlobalScope`, or any
 * port with the same two members. Declared here rather than taken from the
 * `webworker` lib so this package keeps its small ambient type surface.
 */
export interface WorkerScopeLike {
  onmessage: MessageHandler | null;
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
    if (!isLiteratureRequest(event.data)) return;
    const { id, input } = event.data;
    scope.postMessage({ id, result: renderLiterature(input) });
  };
}
