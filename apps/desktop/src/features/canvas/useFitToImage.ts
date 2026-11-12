import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { fitHeight, fitSize, isDefaultSize, type Extent } from "./model/nodes";

/** What a card adds around its picture when nothing can be measured: the lines above it, its padding and its border. */
const FALLBACK_CHROME: Extent = { width: 10, height: 60 };

/** The pixels of `card` that are not the picture area of `body`: measured, so a change to the card's styling needs no change here. */
function measureChrome(
  card: HTMLElement | null,
  body: HTMLElement | null,
): Extent {
  // Nothing is laid out (a test, or a card not yet shown): use the usual.
  if (card === null || body === null) return FALLBACK_CHROME;
  if (!(card.offsetWidth > 0 && card.offsetHeight > 0)) return FALLBACK_CHROME;
  const style = getComputedStyle(body);
  const padX =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0);
  const padY =
    (Number.parseFloat(style.paddingTop) || 0) +
    (Number.parseFloat(style.paddingBottom) || 0);
  return {
    width: card.offsetWidth - (body.clientWidth - padX),
    height: card.offsetHeight - (body.clientHeight - padY),
  };
}

type Options = {
  id: string;
  size: Extent;
  editable: boolean;
  /** Changes whenever the surface asks every figure to fit (Fit all figures). */
  fitSignal: number;
  onFit: (id: string, size: Extent) => void;
  card: RefObject<HTMLElement | null>;
  body: RefObject<HTMLElement | null>;
};

/**
 * Makes a figure's box fit its picture (ADR-0064): when the picture first
 * loads in a card that still has the size it was pinned with, the box takes
 * the picture's shape; the card's Fit button and Fit all figures do it on
 * request; and after a resize by hand the height is corrected so the picture
 * still fills the box. An arranged card is never changed unasked. The shape
 * comes from the loaded `<img>`, so a result with no picture (a table, a
 * script) keeps the default.
 */
export function useFitToImage({
  id,
  size,
  editable,
  fitSignal,
  onFit,
  card,
  body,
}: Options) {
  const [aspect, setAspect] = useState<number | null>(null);
  const autoFitted = useRef(false);
  const startSignal = useRef(fitSignal);
  const snapAfterResize = useRef(false);

  const fit = useCallback(
    (shape: number | null) => {
      if (shape === null) return;
      onFit(id, fitSize(shape, measureChrome(card.current, body.current)));
    },
    [id, onFit, card, body],
  );

  /** Listened to in the capture phase, because a picture's `load` does not bubble. */
  const onPictureLoad = (event: SyntheticEvent) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    const shape = image.naturalWidth / image.naturalHeight;
    setAspect(shape);
    if (editable && !autoFitted.current && isDefaultSize(size)) {
      autoFitted.current = true;
      fit(shape);
    }
  };

  const latest = useRef({ fit, aspect });
  latest.current = { fit, aspect };
  useEffect(() => {
    if (fitSignal === startSignal.current || !editable) return;
    startSignal.current = fitSignal;
    latest.current.fit(latest.current.aspect);
  }, [fitSignal, editable]);

  // After a resize by hand, once the new size is in, correct the height.
  useEffect(() => {
    if (!snapAfterResize.current || aspect === null) return;
    snapAfterResize.current = false;
    const chrome = measureChrome(card.current, body.current);
    const height = fitHeight(size.width, aspect, chrome);
    if (Math.abs(height - size.height) > 1) {
      onFit(id, { width: size.width, height });
    }
  }, [size.width, size.height, aspect, id, onFit, card, body]);

  return {
    aspect,
    onPictureLoad,
    fit: () => fit(aspect),
    /** Call when a resize by hand ends. */
    noteResized: () => {
      snapAfterResize.current = true;
      setTimeout(() => {
        snapAfterResize.current = false;
      }, 1000);
    },
  };
}
