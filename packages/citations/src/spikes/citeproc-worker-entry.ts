import type { CiteprocRequest, CiteprocResponse } from "./citeproc-engine";
import { createState, handleMessage } from "./citeproc-engine";

/**
 * The real Web Worker entry point (spec 6.1: "citeproc-js in a Web
 * Worker"), thinly wrapping the pure reducer in citeproc-engine.ts.
 *
 * Not exercised by any automated test: jsdom (this repo's test DOM) does
 * not implement the Worker API, and Node's worker_threads.Worker uses a
 * different message API than the DOM one, so no test environment here can
 * instantiate a real Worker. The citeproc-js interaction this worker
 * delegates to is fully covered in citeproc-engine.test.ts; only this
 * postMessage/onmessage wiring itself is unverified until it runs inside
 * the actual Tauri webview (Stage 5).
 *
 * `self` is typed with a small local shim rather than the `webworker` lib,
 * to avoid widening this spike package's ambient type surface.
 */

interface WorkerGlobalScope {
  onmessage: ((event: { data: CiteprocRequest }) => void) | null;
  postMessage: (message: CiteprocResponse) => void;
}

declare const self: WorkerGlobalScope;

let state = createState();

self.onmessage = (event) => {
  const result = handleMessage(state, event.data);
  state = result.state;
  self.postMessage(result.response);
};
