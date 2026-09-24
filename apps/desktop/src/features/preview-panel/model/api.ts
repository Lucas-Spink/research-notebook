import type { commands } from "../../../ipc/bindings";
import type { PreviewApi } from "../../preview";

/** The commands the preview panel calls, so tests can supply a fake with
 * their shape (spec 7.6). Includes `PreviewApi`, since the panel embeds
 * `PreviewView` (S3-T10). */
export type PanelApi = PreviewApi &
  Pick<
    typeof commands,
    | "openCapturedFileAction"
    | "openLinkedFileAction"
    | "openProjectFolder"
    | "linkedArtefactAvailability"
  >;
