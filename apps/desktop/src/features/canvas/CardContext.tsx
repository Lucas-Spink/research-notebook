import { createContext, useContext } from "react";
import type { CardServices } from "./model/results";

/** What a card needs from the surface that draws it, without it travelling in every node's data. */
export type CardContextValue = {
  services: CardServices;
  /** The canvas can be changed: cards can be resized, removed and moved to another version. */
  editable: boolean;
  onRemove: (id: string) => void;
  onUpdateVersion: (id: string, version: number) => void;
};

const CardContext = createContext<CardContextValue | null>(null);

export const CardProvider = CardContext.Provider;

export function useCard(): CardContextValue {
  const value = useContext(CardContext);
  if (value === null) throw new Error("a card was drawn outside a canvas");
  return value;
}
