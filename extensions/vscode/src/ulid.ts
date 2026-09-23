import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const TIME_CHARS = 10;
const RANDOM_CHARS = 16;
/** The random part is 80 bits, so 10 bytes. */
const ULID_RANDOM_BYTES = 10;
/** The time part is 48 bits of milliseconds. */
const MAX_TIME = 2 ** 48 - 1;

function encodeTime(milliseconds: number): string {
  if (!Number.isInteger(milliseconds) || milliseconds < 0) {
    throw new RangeError("a ULID time must be a non-negative integer");
  }
  if (milliseconds > MAX_TIME) {
    throw new RangeError("a ULID time must fit 48 bits");
  }
  let rest = milliseconds;
  let out = "";
  for (let i = 0; i < TIME_CHARS; i += 1) {
    out = (CROCKFORD[rest % 32] ?? "0") + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

function encodeRandom(bytes: Uint8Array): string {
  if (bytes.length !== ULID_RANDOM_BYTES) {
    throw new RangeError(`a ULID needs ${ULID_RANDOM_BYTES} random bytes`);
  }
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = "";
  for (let i = 0; i < RANDOM_CHARS; i += 1) {
    out = (CROCKFORD[Number(value & 31n)] ?? "0") + out;
    value >>= 5n;
  }
  return out;
}

/**
 * A ULID from a time and 10 random bytes (spec 5.2): 26 characters of
 * Crockford Base32, the time first so identifiers sort by creation. Both
 * inputs are arguments so tests are deterministic. Same algorithm as
 * `apps/desktop/src/shared/ulid.ts`, duplicated rather than shared because
 * `extensions/` must not depend on `apps/` (AGENTS.md section 4).
 */
export function ulid(milliseconds: number, random: Uint8Array): string {
  return encodeTime(milliseconds) + encodeRandom(random);
}

/** A fresh ULID for the running extension, using the current time and Node's
 * cryptographically secure random source. */
export function newUlid(): string {
  return ulid(Date.now(), randomBytes(ULID_RANDOM_BYTES));
}
