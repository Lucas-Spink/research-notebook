import { z } from "zod";
import {
  ArtefactMode,
  ArtefactRole,
  Count,
  FileName,
  FormatVersion,
  Provenance,
  Sha256,
  SingleLine,
  Source,
  Timestamp,
  Ulid,
} from "./common";

/**
 * A request is transient and never migrated (ADR-0064), so one written by an
 * extension still on format version 1 is read as well as one on version 2.
 */
const RequestFormatVersion = z.union([z.literal(1), FormatVersion]);

/**
 * Spec 5.10: `inbox/<ULID>/request.json`. Written by the VS Code extension,
 * read by the application. `payload` is null exactly when `mode` is `link`.
 * That `request_id` equals the folder name is checked on import, not here.
 */
export const InboxRequest = z
  .looseObject({
    format_version: RequestFormatVersion,
    request_id: Ulid,
    created: Timestamp,
    created_by: SingleLine,
    experiment_id: Ulid,
    role: ArtefactRole,
    mode: ArtefactMode,
    source: Source,
    payload: FileName.nullable(),
    sha256: Sha256,
    size: Count,
    // Null rather than omitted when the source is not in a repository (spec 5.10).
    provenance: Provenance.nullable(),
    group_path: z.array(SingleLine).optional(),
  })
  .superRefine((request, ctx) => {
    if (request.mode === "copy" && request.payload === null) {
      ctx.addIssue({
        code: "custom",
        path: ["payload"],
        message: "copy mode requires a payload",
      });
    }
    if (request.mode === "link" && request.payload !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["payload"],
        message: "link mode has no payload",
      });
    }
  });

export type InboxRequestModel = z.infer<typeof InboxRequest>;
