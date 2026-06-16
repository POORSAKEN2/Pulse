// Session ownership checks. There are no accounts: at /api/join the server mints
// a per-session secret `token` and stores it on the Presence row. The session id
// is PUBLIC (broadcast as the peer dot), but every *mutating* call must prove it
// owns that id by presenting the matching token. This is what stops one client
// from impersonating, evicting, or busy-griefing another.
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const TOKEN_HEADER = "x-pulse-token";

// Read the session token from the custom request header. A custom header also
// means browsers won't send it cross-origin without a CORS preflight we never
// grant — closing the any-origin/CSRF vector on poll + signal.
export function extractToken(request: Request): string | null {
  return request.headers.get(TOKEN_HEADER);
}

// Constant-time compare that never throws on length mismatch.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// True iff a Presence row with this id exists AND its token matches.
export async function verifyOwner(
  id: string,
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  const row = await prisma.presence.findUnique({
    where: { id },
    select: { token: true },
  });
  if (!row) return false;
  return safeEqual(row.token, token);
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
