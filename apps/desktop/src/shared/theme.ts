import { useSyncExternalStore } from "react";

/** The two looks the application has. Dark is the default. */
export type Theme = "dark" | "light";

const KEY = "strata-theme";
const DEFAULT_THEME: Theme = "dark";

const listeners = new Set<() => void>();

/**
 * The chosen theme. It is a preference of this machine, not project data, so
 * it is kept in the browser's storage and never in a project folder. Storage
 * can be missing or blocked, in which case the default is used.
 */
export function storedTheme(): Theme {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Puts `theme` on the page, which the colour tokens in `styles/tokens.css` follow. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Applies the stored theme; called once before anything is drawn, so there is no flash of the other one. */
export function initTheme(): void {
  applyTheme(storedTheme());
}

/** Changes the theme now and remembers it. */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // Not being able to remember it only means the next start uses the default.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current theme and a way to change it, for a control that shows it. */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(
    subscribe,
    storedTheme,
    () => DEFAULT_THEME,
  );
  return { theme, setTheme };
}
