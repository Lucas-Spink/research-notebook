import { useTheme } from "./theme";

/** A button that switches between the dark and light themes, for pages without the ribbon. */
export function ThemeToggle({ label }: { label: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-pressed={theme === "dark"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {label}
    </button>
  );
}
