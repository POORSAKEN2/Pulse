import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidSessionId } from "@/lib/validate";
import { verifyOwner, unauthorized } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id, token }. Removes the presence row and any pending
// signals to/from this user. Called via navigator.sendBeacon on tab close, so
// the body may arrive as text — parse defensively. sendBeacon can't set custom
// headers, so the token rides in the body (not the X-Pulse-Token header).
export async function POST(request: NextRequest) {
  const rl = await rateLimit(`${clientIp(request)}:leave`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let id: string | undefined;
  let token: string | undefined;
  try {
    const text = await request.text();
    if (text) {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      id = typeof parsed.id === "string" ? parsed.id : undefined;
      token = typeof parsed.token === "string" ? parsed.token : undefined;
    }
  } catch {
    id = undefined;
  }

  if (!isValidSessionId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  // Only the session owner may remove it — blocks forced eviction of other users.
  if (!(await verifyOwner(id, token))) {
    return unauthorized();
  }

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });
  await prisma.presence.deleteMany({ where: { id } });

  return Response.json({ ok: true });
}
