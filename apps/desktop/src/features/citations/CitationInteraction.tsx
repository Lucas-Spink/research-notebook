import { createContext, useContext } from "react";

/**
 * What activating a citation does: take the person to that source in the
 * Bibliography below the table (S6-T01). The workspace provides it; outside
 * one, a citation has nowhere to go and does nothing.
 */
export type CitationJump = (citekey: string) => void;

const CitationJumpContext = createContext<CitationJump>(() => undefined);

export const CitationJumpProvider = CitationJumpContext.Provider;

export const useCitationJump = (): CitationJump =>
  useContext(CitationJumpContext);
