import { useEffect, useRef, useState, type RefObject } from "react";
import type { ChosenFile, FolderHandle } from "../../../ipc/bindings";
import type { DropsApi, Unlisten } from "./dropsApi";
import { pointerInZone } from "./model/dropZone";

type Options = {
  api: DropsApi;
  /** The element files may be dropped on. */
  zone: RefObject<HTMLElement | null>;
  /** Drops are received only while this is true, for the open project. */
  enabled: boolean;
  folder: FolderHandle;
  projectId: string;
  externalRoots: string[];
  /** Called with what was dropped on the zone, as a picked file is. */
  onDrop: (files: ChosenFile[]) => void;
};

/** Runs `work`, ignoring a failure: without the window's events a drop simply does nothing. */
const attempt = (work: () => Promise<unknown>) =>
  Promise.resolve()
    .then(work)
    .catch(() => undefined);

/**
 * Receives files dropped on the window and hands those dropped on `zone`
 * to `onDrop` (ADR-0044 point 2). Rust resolves the dropped paths, so this
 * only ever sees locations. Returns whether files are being dragged over
 * the zone, for it to show.
 */
export function useDropFiles({
  api,
  zone,
  enabled,
  folder,
  projectId,
  externalRoots,
  onDrop,
}: Options): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(onDrop);
  latest.current = onDrop;
  // A new array of the same roots must not restart the listeners.
  const rootsKey = externalRoots.join(",");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const stops: Unlisten[] = [];
    const over = (x: number | null, y: number | null) => {
      const element = zone.current;
      return (
        element !== null &&
        pointerInZone(
          x,
          y,
          window.devicePixelRatio,
          element.getBoundingClientRect(),
        )
      );
    };
    const keep = (listening: Promise<Unlisten>) =>
      attempt(async () => {
        const stop = await listening;
        if (active) stops.push(stop);
        else stop();
      });

    void attempt(() =>
      api.watch(folder, projectId, rootsKey === "" ? [] : rootsKey.split(",")),
    );
    void keep(
      Promise.resolve().then(() =>
        api.onDragged((event) =>
          setDragging(event.over && over(event.x, event.y)),
        ),
      ),
    );
    void keep(
      Promise.resolve().then(() =>
        api.onDropped((event) => {
          setDragging(false);
          if (over(event.x, event.y)) latest.current(event.files);
        }),
      ),
    );
    return () => {
      active = false;
      for (const stop of stops) stop();
      setDragging(false);
      void attempt(() => api.unwatch());
    };
  }, [api, zone, enabled, folder, projectId, rootsKey]);

  return { dragging };
}
