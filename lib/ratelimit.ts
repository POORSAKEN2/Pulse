// Postgres-backed fixed-window rate limiter. We can't use Redis/Upstash because
// the app must deploy to Vercel with no external services, and an in-memory
// limiter wouldn't survive across serverless invocations. A fixed window costs
// one upsert per request — cheap enough, slightly less precise than a sliding
// window at window edges (acceptable trade-off, documented in NOTES.md).
import { prisma } from "@/lib/prisma";

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number; // seconds until the current window resets
}

// Best-effort client IP. On Vercel `x-forwarded-for` is set by the platform;
// it's spoofable in general, so this is a throttle, not an identity.
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function rateLimit(
  bucket: string, // e.g. `${ip}:poll`
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${bucket}:${windowStart}`;
  const expiresAt = new Date(windowStart + windowMs);

  const row = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  const retryAfterSec = Math.ceil((windowStart + windowMs - now) / 1000);
  return { ok: row.count <= limit, retryAfterSec };
}

export function tooManyRequests(retryAfterSec: number) {
  return Response.json(
    { error: "rate limited" },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
