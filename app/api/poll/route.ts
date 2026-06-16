import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import type { PollResponse } from "@/lib/types";
import { extractToken, verifyOwner, unauthorized } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap on peers returned per poll — bounds payload + client render so a flood of
// fake /api/join dots can't blow up every other client's map.
const MAX_PEERS = 500;

// GET /api/poll?id= — the single endpoint that drives the live map.
// It (1) heartbeats the caller, (2) reaps stale presence + orphan signals,
// (3) returns the filtered online peers, and (4) drains this user's mailbox.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");

  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  const rl = await rateLimit(`${clientIp(request)}:poll`, 120, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  // Only the owner of this session id may heartbeat/drain it.
  if (!(await verifyOwner(id, extractToken(request)))) {
    return unauthorized();
  }

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  // 1) Heartbeat — refresh lastSeen for the caller ONLY. Bumping every row
  // (where: {}) would keep all presences alive forever, so stale dots would
  // never be reaped and would linger after users leave.
  await prisma.presence.updateMany({
    where: { id },
    data: { lastSeen: new Date(now) },
  });

  // 2) Reap stale presence rows and orphaned signals (independent deletes —
  // no atomicity needed, and avoids transactions over a PgBouncer pooler).
  await prisma.presence.deleteMany({ where: { lastSeen: { lt: staleCutoff } } });
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });
  // Piggyback cleanup of expired rate-limit windows so the table can't grow.
  await prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });

  // 3) Online peers, excluding self. Capped + newest-first so a join-flood
  // can't return an unbounded list.
  const peers = await prisma.presence.findMany({
    where: {
      id: { not: id },
      lastSeen: { gte: staleCutoff },
    },
    select: { id: true, lat: true, lng: true, busy: true },
    orderBy: { lastSeen: "desc" },
    take: MAX_PEERS,
  });

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const response: PollResponse = {
    peers: peers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      busy: p.busy,
    })),
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return Response.json(response);
}
