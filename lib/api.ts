// Client-side helpers for talking to the coordination API.
import type { PollResponse, SignalType } from "@/lib/types";

const TOKEN_HEADER = "X-Pulse-Token";

// The server mints a per-session secret token at /api/join. We hold it in module
// memory (never localStorage — it dies with the tab, like everything in Pulse)
// and attach it to every later call so the server can verify we own our id.
let auth: { id: string; token: string } | null = null;

export async function join(
  id: string,
  lat: number,
  lng: number,
): Promise<void> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, lat, lng }),
  });
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("join: missing token");
  auth = { id, token: data.token };
}

export async function poll(id: string): Promise<PollResponse> {
  const res = await fetch(`/api/poll?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: auth ? { [TOKEN_HEADER]: auth.token } : undefined,
  });
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

export async function sendSignal(
  fromId: string,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<void> {
  await fetch("/api/signal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { [TOKEN_HEADER]: auth.token } : {}),
    },
    body: JSON.stringify({ fromId, toId, type, payload }),
  });
}

// Fire-and-forget leave that survives the tab closing. sendBeacon can't set
// headers, so the token travels in the body instead of the X-Pulse-Token header.
export function leave(id: string): void {
  const body = JSON.stringify({ id, token: auth?.token });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/leave", body);
  } else {
    void fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  }
}
