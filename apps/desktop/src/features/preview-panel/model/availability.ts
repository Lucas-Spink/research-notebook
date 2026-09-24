import type { ArtefactModel } from "@research-notebook/format";
import type { Availability } from "../../../ipc/bindings";

/** What the panel shows for a link-mode artefact's availability while a
 * live check is in flight or has failed to run at all (FR-EVD-07). */
export type AvailabilityState =
  | { status: "checking" }
  | { status: "checked"; availability: Availability }
  | { status: "failed" };

/** The `{root, path}` a link-mode artefact's availability is checked from;
 * `undefined` for a copy-mode artefact, which has none to check. */
export function linkSourceOf(artefact: ArtefactModel) {
  return artefact.mode === "link" ? artefact.source : undefined;
}
