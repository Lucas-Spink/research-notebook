import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  serialiseRequest,
  type InboxRequestModel,
} from "@research-notebook/format";

/**
 * Writes one inbox request (spec 5.10, FR-VSC-05, FR-VSC-06): the payload
 * (copy mode only) and `request.json` go into a folder named
 * `<request_id>.tmp`, which is renamed to `<request_id>` only once both
 * files are written — the same atomic convention
 * `nb-fs::list_inbox_requests` (S3-T05) already expects, so a reader never
 * sees a half-written request. Writes nothing else under `_notebook/`.
 */
export async function writeInboxRequest(
  projectRoot: string,
  request: InboxRequestModel,
  payload: Buffer | null,
): Promise<void> {
  const inboxDir = join(projectRoot, "_notebook", "inbox");
  const tempDir = join(inboxDir, `${request.request_id}.tmp`);
  const finalDir = join(inboxDir, request.request_id);

  await mkdir(tempDir, { recursive: true });
  if (request.payload !== null) {
    if (payload === null) {
      throw new Error("a copy-mode request needs its payload bytes");
    }
    await writeFile(join(tempDir, request.payload), payload);
  }
  await writeFile(join(tempDir, "request.json"), serialiseRequest(request));
  await rename(tempDir, finalDir);
}
