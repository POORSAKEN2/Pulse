import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidSessionId } from "@/lib/validate";
import { isValidVibe } from "@/lib/vibes";
import { extractToken, verifyOwner, unauthorized } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/vibe — body { id, vibe }. Updates the caller's vibe on their
// existing presence row so a change is reflected on every other client's map at
// their next poll. Owner-only (token), and vibe must be one of the fixed set
// (or null to clear) — never trust a raw client string into the store. Mirrors
// the validation in /api/join.
export async function POST(request: NextRequest) {
  const rl = await rateLimit(`${clientIp(request)}:vibe`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, vibe } = (body ?? {}) as Record<string, unknown>;

  if (!isValidSessionId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const clearing = vibe === undefined || vibe === null;
  if (!clearing && !isValidVibe(vibe)) {
    return Response.json({ error: "invalid vibe" }, { status: 400 });
  }

  // Owner-only: the session id is public, so without the token anyone could
  // rewrite another user's vibe.
  if (!(await verifyOwner(id, extractToken(request)))) {
    return unauthorized();
  }

  await prisma.presence.updateMany({
    where: { id },
    data: { vibe: clearing ? null : (vibe as string) },
  });

  return Response.json({ ok: true });
}
