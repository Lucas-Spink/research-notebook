/**
 * Minimal ambient types for the `citeproc` package (spec 6.1): it ships no
 * type declarations of its own and none exist on DefinitelyTyped. Scoped to
 * only the surface this spike uses.
 */
declare module "citeproc" {
  export interface CslItemLike {
    id: string;
    [key: string]: unknown;
  }

  export interface CiteprocSys {
    retrieveLocale(lang: string): string;
    retrieveItem(id: string): CslItemLike;
  }

  /** [citationID, noteIndex] — a cluster already in the registry, by position. */
  export type ClusterPosition = [citationID: string, noteIndex: number];

  export interface CitationItemRef {
    id: string;
    [key: string]: unknown;
  }

  export interface Citation {
    citationID: string;
    citationItems: CitationItemRef[];
    properties: { noteIndex: number };
  }

  export interface ClusterStatus {
    bibchange: boolean;
    citation_errors: string[];
  }

  /** [index, renderedText, citationID] for each cluster that changed. */
  export type ClusterUpdateTuple = [
    index: number,
    text: string,
    citationID: string,
  ];

  export interface EngineInstance {
    updateItems(idList: string[]): void;
    processCitationCluster(
      citation: Citation,
      citationsPre: ClusterPosition[],
      citationsPost: ClusterPosition[],
    ): [ClusterStatus, ClusterUpdateTuple[]];
    makeBibliography(): [unknown, string[]];
  }

  export interface EngineConstructor {
    new (
      sys: CiteprocSys,
      style: string,
      lang?: string,
      forceLang?: boolean,
    ): EngineInstance;
  }

  interface CSL {
    Engine: EngineConstructor;
  }

  const csl: CSL;
  export default csl;
}
