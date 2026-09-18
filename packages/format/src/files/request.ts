import { REQUEST_SHAPE, orderByShape } from "../key-order";
import type { FormatError, Result } from "../result";
import { InboxRequest, type InboxRequestModel } from "../schema";
import { parseJsonFile } from "./read";

/** Parses an inbox `request.json`. Unknown keys are accepted and kept. */
export function parseRequest(
  text: string,
): Result<InboxRequestModel, FormatError> {
  return parseJsonFile(text, InboxRequest);
}

/** Writes `request.json` in canonical form (format-v1.md 3.5). */
export function serialiseRequest(request: InboxRequestModel): string {
  return `${JSON.stringify(orderByShape(request, REQUEST_SHAPE), null, 2)}\n`;
}
