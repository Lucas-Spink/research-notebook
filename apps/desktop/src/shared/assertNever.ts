/** Ends a `switch` over a union so adding a member is a compile error. */
export function assertNever(value: never): never {
  throw new Error(`unhandled case: ${JSON.stringify(value)}`);
}
