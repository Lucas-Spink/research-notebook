import {
  attachLiteratureWorker,
  type WorkerScopeLike,
} from "./worker-protocol";

/**
 * The real Web Worker entry point (spec 6.1). The webview starts it with
 * `new Worker(new URL(".../worker-entry.ts", import.meta.url), { type: "module" })`.
 * Its logic is `attachLiteratureWorker`, tested over a structured-clone
 * channel in worker.test.ts; the one line below, and the Worker constructor,
 * are checked in the running app.
 */
declare const self: WorkerScopeLike;

attachLiteratureWorker(self);
