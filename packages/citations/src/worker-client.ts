import type { LiteratureInput, LiteratureResult } from "./literature";
import type { LiteratureReply, LiteratureRequest } from "./worker-protocol";

/** The caller's side of the channel: a `Worker`, or any port with the same members. */
export interface WorkerHandleLike {
  onmessage: ((event: { data: LiteratureReply }) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  postMessage(request: LiteratureRequest): void;
  terminate?: () => void;
}

export interface LiteratureClient {
  /** Renders in the worker. Rejects only if the worker fails or is disposed; a bad style is an `ok: false` result. */
  render(input: LiteratureInput): Promise<LiteratureResult>;
  /** Stops the worker and rejects everything still waiting. */
  dispose(): void;
}

type Pending = {
  resolve: (result: LiteratureResult) => void;
  reject: (error: Error) => void;
};

/** Talks to a worker running `attachLiteratureWorker`, matching replies to requests by id. */
export function createLiteratureClient(
  worker: WorkerHandleLike,
): LiteratureClient {
  const pending = new Map<number, Pending>();
  let nextId = 1;

  function rejectAll(reason: string) {
    for (const waiting of pending.values()) waiting.reject(new Error(reason));
    pending.clear();
  }

  worker.onmessage = (event) => {
    const waiting = pending.get(event.data.id);
    if (waiting === undefined) return;
    pending.delete(event.data.id);
    waiting.resolve(event.data.result);
  };
  worker.onerror = () => rejectAll("the citation worker failed");

  return {
    render: (input) =>
      new Promise<LiteratureResult>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, input });
      }),
    dispose: () => {
      rejectAll("the citation worker was stopped");
      worker.terminate?.();
    },
  };
}
