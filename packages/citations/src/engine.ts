// citeproc ships no types, so its hand-written declaration must be in every
// program that compiles this file, including apps/desktop's, whose tsconfig is
// protected. An `import` cannot pull in an ambient module declaration.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./citeproc.d.ts" />
import type {
  Citation,
  CiteprocSys,
  ClusterPosition,
  CslItemLike,
  EngineInstance,
} from "citeproc";
import CSL from "citeproc";

/**
 * A pure, testable reducer over citeproc-js (spec 6.1), wrapping the exact
 * calls a Web Worker message handler makes. It is separate from
 * postMessage/onmessage (see worker-entry.ts) so the citeproc-js interaction
 * itself can be tested without a Worker. ADR-0012 chose this design in S1-T03;
 * `literature.ts` drives it for the Literature block (S5-T05).
 */

/**
 * A CSL-JSON item as `bibliography.json` holds it: only `id` is required
 * here, and every other field (type, title, author, `_zotero`, ...) passes
 * through to citeproc-js, which ignores what it does not know.
 */
export type CslItem = CslItemLike;

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
