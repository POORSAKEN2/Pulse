import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { isValidSessionId } from "@/lib/validate";
import { isValidVibe } from "@/lib/vibes";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { id, lat, lng } (raw coords).
// Applies a 1–3 km privacy offset, creates the presence row, and mints a
// per-session secret token returned to the caller. Raw coordinates are never
// stored. Every later mutating call must present this token to prove ownership.
export async function POST(request: NextRequest) {
  const rl = await rateLimit(`${clientIp(request)}:join`, 10, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, lat, lng, vibe } = (body ?? {}) as Record<string, unknown>;

  if (!isValidSessionId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }
  // Vibe is optional, but if present it must be one of the fixed set — never
  // trust a client-supplied string into the store.
  if (vibe !== undefined && vibe !== null && !isValidVibe(vibe)) {
    return Response.json({ error: "invalid vibe" }, { status: 400 });
  }

  const offset = applyPrivacyOffset(lat as number, lng as number);
  const token = randomUUID();

  // Create (not upsert): join is first-contact, so the caller holds no token
  // yet. If the id already exists, the caller can't prove ownership — reject to
  // block id takeover. UUID collisions are vanishingly unlikely for real users.
  try {
    await prisma.presence.create({
      data: {
        id,
        token,
        lat: offset.lat,
        lng: offset.lng,
        busy: false,
        vibe: isValidVibe(vibe) ? vibe : null,
        lastSeen: new Date(),
      },
    });
  } catch {
    // Unique constraint violation (id already present) or similar.
    return Response.json({ error: "id already in use" }, { status: 409 });
  }

  return Response.json({ ok: true, token });
}
