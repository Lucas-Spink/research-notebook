import { createContext, useContext } from "react";
import type { Extent } from "./model/nodes";
import type { CardServices } from "./model/results";
import type { TableChange } from "./model/tables";

/** What a card needs from the surface that draws it, without it travelling in every node's data. */
export type CardContextValue = {
  services: CardServices;
  /** The canvas can be changed: cards can be resized, removed and moved to another version. */
  editable: boolean;
  onRemove: (id: string) => void;
  onUpdateVersion: (id: string, version: number) => void;
  /** Changes one table: its rows, columns, headings or cells. */
  onTable: (id: string, change: TableChange) => void;
  /** Makes an id for a new row or column. */
  newId: () => string;
  /** Gives a card the size that fits its picture. */
  onFit: (id: string, size: Extent) => void;
  /** Changes each time the surface asks every figure to fit its picture. */
  fitSignal: number;
  /** The note that has just been added and should take the cursor, or `null`. */
  focusId: string | null;
  /** The note has taken the cursor. */
  onFocused: () => void;
  /** A note's text, as typed. */
  onNoteText: (id: string, text: string) => void;
};

const CardContext = createContext<CardContextValue | null>(null);

export const CardProvider = CardContext.Provider;

export function useCard(): CardContextValue {
  const value = useContext(CardContext);
  if (value === null) throw new Error("a card was drawn outside a canvas");
  return value;
}
