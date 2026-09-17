import type {
  Citation,
  CiteprocSys,
  ClusterPosition,
  CslItemLike,
  EngineInstance,
} from "citeproc";
import CSL from "citeproc";

/**
 * Spike for S1-T03: a pure, testable reducer over citeproc-js, wrapping the
 * exact calls a Web Worker message handler would make. Deliberately
 * separated from postMessage/onmessage (see citeproc-worker-entry.ts) so
 * the citeproc-js interaction itself — numbering, clusters, bibliography —
 * can be tested without a real Worker, which this environment cannot
 * instantiate (jsdom has no Worker; Node's worker_threads.Worker uses a
 * different message API). This is spike evidence, not the production
 * worker protocol — that is built in Stage 5 (S5-T05).
 */

export interface CslItem extends CslItemLike {
  type: string;
  title?: string;
  author?: Array<{ family?: string; given?: string }>;
  issued?: { "date-parts": number[][] };
}

export interface CiteprocInitRequest {
  type: "init";
  styleXml: string;
  localeXml: string;
  items: Record<string, CslItem>;
}

export interface CiteRequest {
  type: "cite";
  citation: Citation;
  citationsPre: ClusterPosition[];
  citationsPost: ClusterPosition[];
}

export interface BibliographyRequest {
  type: "bibliography";
}

export type CiteprocRequest =
  CiteprocInitRequest | CiteRequest | BibliographyRequest;

export interface InitResponse {
  type: "init";
}

export interface ClusterUpdate {
  index: number;
  text: string;
  citationID: string;
}

export interface CiteResponse {
  type: "cite";
  bibliographyChanged: boolean;
  updates: ClusterUpdate[];
}

export interface BibliographyResponse {
  type: "bibliography";
  entries: string[];
}

export type CiteprocResponse =
  InitResponse | CiteResponse | BibliographyResponse;

export interface CiteprocState {
  engine: EngineInstance | null;
}

export function createState(): CiteprocState {
  return { engine: null };
}

function assertNever(value: never): never {
  throw new Error(`unhandled request type: ${JSON.stringify(value)}`);
}

function requireEngine(state: CiteprocState): EngineInstance {
  if (!state.engine) {
    throw new Error("citeproc engine is not initialised");
  }
  return state.engine;
}

function makeSys(
  localeXml: string,
  items: Record<string, CslItem>,
): CiteprocSys {
  return {
    retrieveLocale: () => localeXml,
    retrieveItem: (id: string) => {
      const item = items[id];
      if (!item) {
        throw new Error(`unknown citeproc item id: ${id}`);
      }
      return item;
    },
  };
}

export function handleMessage(
  state: CiteprocState,
  request: CiteprocRequest,
): { state: CiteprocState; response: CiteprocResponse } {
  switch (request.type) {
    case "init": {
      const sys = makeSys(request.localeXml, request.items);
      const engine = new CSL.Engine(sys, request.styleXml, "en-US");
      engine.updateItems(Object.keys(request.items));
      return { state: { engine }, response: { type: "init" } };
    }
    case "cite": {
      const engine = requireEngine(state);
      const [status, updates] = engine.processCitationCluster(
        request.citation,
        request.citationsPre,
        request.citationsPost,
      );
      return {
        state,
        response: {
          type: "cite",
          bibliographyChanged: status.bibchange,
          updates: updates.map(([index, text, citationID]) => ({
            index,
            text,
            citationID,
          })),
        },
      };
    }
    case "bibliography": {
      const engine = requireEngine(state);
      const [, entries] = engine.makeBibliography();
      return { state, response: { type: "bibliography", entries } };
    }
    default:
      return assertNever(request);
  }
}
