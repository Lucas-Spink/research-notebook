import { useCallback, useEffect, useState } from "react";
import {
  loadPreview,
  loadThumbnail,
  type PreviewApi,
  type PreviewState,
  type PreviewTarget,
  type Thumbnail,
} from "./model/load";
import type { PreviewPlan } from "./model/plan";

type Options = {
  api: PreviewApi;
  target: PreviewTarget;
  plan: PreviewPlan;
};

/** A stable key for a plan, so an equal plan in a new object reloads nothing. */
const planKey = (plan: PreviewPlan) =>
  plan.kind === "other" ? `other:${plan.reason}` : plan.kind;

/**
 * Loads and holds one version's preview (spec 8): the state to show, whether
 * a table is expanded and an image zoomed, and the recovery actions. The
 * steps are in `model/load`; this only holds their result.
 */
export function usePreview({ api, target, plan }: Options) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [expanded, setExpanded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { folder, file, sha256 } = target;
  const key = planKey(plan);

  // A different version starts unexpanded and fitted to the panel.
  useEffect(() => {
    setExpanded(false);
    setZoomed(false);
  }, [folder, file]);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    void loadPreview(api, { folder, file, sha256 }, plan, expanded).then(
      (next) => {
        if (live) setState(next);
      },
    );
    return () => {
      live = false;
    };
    // `plan` is followed through `key`, so an equal plan does not reload.
  }, [api, folder, file, sha256, key, expanded, attempt]);

  return {
    state,
    expanded,
    zoomed,
    expand: useCallback(() => setExpanded(true), []),
    toggleZoom: useCallback(() => setZoomed((z) => !z), []),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
    renderFailed: useCallback(
      () => setState({ status: "failed", failure: "renderFailed" }),
      [],
    ),
  };
}

/** Loads one version's thumbnail (spec 8); `null` until it is known. */
export function useThumbnail({ api, target, plan }: Options): Thumbnail | null {
  const [thumbnail, setThumbnail] = useState<Thumbnail | null>(null);
  const { folder, file, sha256 } = target;
  const key = planKey(plan);

  useEffect(() => {
    let live = true;
    setThumbnail(null);
    void loadThumbnail(api, { folder, file, sha256 }, plan).then((next) => {
      if (live) setThumbnail(next);
    });
    return () => {
      live = false;
    };
  }, [api, folder, file, sha256, key]);

  return thumbnail;
}
