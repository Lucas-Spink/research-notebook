import { useEffect, useRef, useState, type ReactNode } from "react";

/** How far outside the visible part of the list a place counts as near enough to draw. */
const NEAR = "200px";

type Props = {
  /** Drawn in the place until it is near; also holds its size, so the list does not jump. */
  placeholder: ReactNode;
  children: ReactNode;
};

/**
 * Draws `children` only once this place has come near the part of the page that
 * is showing, so a long list of pictures loads as it is scrolled to instead of
 * all at once. Once drawn it stays drawn. Where the browser cannot say what is
 * in view, it draws at once.
 */
export function LazyMount({ placeholder, children }: Props) {
  const place = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = place.current;
    if (near || node === null || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: NEAR },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  return <span ref={place}>{near ? children : placeholder}</span>;
}
