/** A rectangle in CSS pixels, as `getBoundingClientRect` gives one. */
export type ZoneRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/**
 * Whether the pointer is over a zone. The window reports it in physical
 * pixels, and either coordinate is `null` when it could not be carried, so
 * a drop like that is never placed over a zone. `pixelRatio` turns physical
 * pixels into the CSS pixels the zone is measured in.
 */
export function pointerInZone(
  x: number | null,
  y: number | null,
  pixelRatio: number,
  zone: ZoneRect,
): boolean {
  if (x === null || y === null || !(pixelRatio > 0)) return false;
  const cssX = x / pixelRatio;
  const cssY = y / pixelRatio;
  return (
    cssX >= zone.left &&
    cssX <= zone.right &&
    cssY >= zone.top &&
    cssY <= zone.bottom
  );
}
