import { z } from "zod";
import { AppVersion, SingleLine, Timestamp } from "./common";

/**
 * Spec 5.11: `_notebook/.lock`, present while a writer has the project open.
 * The heartbeat is refreshed every 60 seconds; a lock without one for five
 * minutes is stale and may be taken over after user confirmation.
 */
export const LockFile = z.looseObject({
  host: SingleLine,
  pid: z.number().int().positive(),
  app_version: AppVersion,
  opened: Timestamp,
  heartbeat: Timestamp,
});

export type LockFileModel = z.infer<typeof LockFile>;
