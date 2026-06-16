// Shared validation for client-generated session ids. An id is the public peer
// identifier (a crypto.randomUUID() on the client). We only bound its shape so
// callers can't write oversized / malformed actor ids into the store.
export function isValidSessionId(x: unknown): x is string {
  return typeof x === "string" && x.length >= 8 && x.length <= 64;
}
