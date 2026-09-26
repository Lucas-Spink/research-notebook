import { useEffect, useState, type RefObject } from "react";

/**
 * The inner width of `element`, without scrollbars, kept current as it
 * resizes; 0 until first measured. There is no ResizeObserver in jsdom, where
 * it stays 0 and the table keeps its stored widths.
 */
export function useElementWidth(
  element: RefObject<HTMLElement | null>,
): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const target = element.current;
    if (target === null || typeof ResizeObserver === "undefined") return;
    // An observer reports each element once when observing starts.
    const observer = new ResizeObserver(() => setWidth(target.clientWidth));
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return width;
}
