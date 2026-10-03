import { createContext, useContext } from "react";

/**
 * What activating a citation does (S6-T01). A single click opens the source
 * in the side pane, and a double click takes the person down the page to its
 * entry in the Bibliography. The workspace provides both; outside one, a
 * citation has nowhere to go and does nothing.
 */
export type CitationActions = {
  /** Shows the source's details in the side pane. */
  open: (citekey: string) => void;
  /** Scrolls the page to the source's entry in the Bibliography. */
  jump: (citekey: string) => void;
};

const NOWHERE: CitationActions = {
  open: () => undefined,
  jump: () => undefined,
};

const CitationActionsContext = createContext<CitationActions>(NOWHERE);

export const CitationActionsProvider = CitationActionsContext.Provider;

export const useCitationActions = (): CitationActions =>
  useContext(CitationActionsContext);
