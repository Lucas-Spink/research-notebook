import type { InboxRequestModel } from "../schema";
import { fail, type FormatError, type Result } from "../result";

/** Parses an inbox `request.json`. */
export function parseRequest(
  _text: string,
): Result<InboxRequestModel, FormatError> {
  void _text;
  return fail({ kind: "syntax", message: "not implemented" });
}

/** Writes `request.json` in canonical form. */
export function serialiseRequest(_request: InboxRequestModel): string {
  void _request;
  throw new Error("not implemented");
}
