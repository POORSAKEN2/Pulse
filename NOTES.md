# Pulse — Notes

## Phase 1 — Make it run

### Root cause of the 500s
The API routes 500'd because the database tables didn't exist yet — the Prisma
schema had never been pushed to the Neon DB. Running `npx prisma db push`
(which also regenerates the client) created `Presence` + `Signal` and the
endpoints went green. This is a setup step, not a code defect, but it's what
produced the wall of 500s on first run.

With the app actually running, four real code bugs broke the end-to-end flow:

### Bug 1 — Stale dots never disappear (the headline bug)
- **Where:** `app/api/poll/route.ts` — the per-poll heartbeat.
- **Broken:** `prisma.presence.updateMany({ where: {}, ... })` refreshed
  `lastSeen` on **every** presence row on every poll, so the staleness reaper
  (`lastSeen < now - 15s`) could never match anyone. Dots lingered forever after
  users left — exactly the symptom called out in the README.
- **How I found it:** the very first `/api/poll` returned a ghost peer
  (`alice-aaaaaa`) that wouldn't die; tracing why led straight to the
  `where: {}` match-all.
- **Fix:** heartbeat only the caller — `where: { id }`. Verified: a peer that
  stops polling is reaped after ~15s while an actively-polling peer survives.

### Bug 2 — Users stuck "busy" forever after a call
- **Where:** `app/api/signal/route.ts` — busy-flag transitions.
- **Broken:** the comment says "decline/end free both peers" but the code only
  cleared `busy` on `decline`. After any hang-up (`end`), both peers stayed
  `busy = true`, so their dots stayed dimmed and any new request to them was
  auto-declined — they could never connect again.
- **Fix:** clear `busy` on `decline` **or** `end`. Verified the full lifecycle
  via curl: `busy` goes false → true (accept) → false (end).

### Bug 3 — Text chat silently dropped
- **Where:** `lib/webrtc.ts` — data-channel message format.
- **Broken:** `sendChat` emitted `{ t: "msg", text }`, but the receiver
  (`wireDataChannel.onmessage`) dispatches on `t === "chat"`. Every received
  message fell through and was discarded; the sender saw their own bubble, the
  peer saw nothing.
- **Fix:** send `{ t: "chat", text }` to match the receiver (control messages
  already used the matching `t: "ctrl"`).

### Bug 4 — `busy` leaks on ungraceful disconnect
- **Where:** `app/page.tsx` — WebRTC `onConnectionState`.
- **Broken:** when a peer's tab closed / network dropped, our side hit
  connection state `"failed"` and tore down locally but never sent an `"end"`
  signal, so our own presence stayed `busy = true` in the DB until reload.
- **Fix:** send `end` to the (now-gone) peer on `"failed"`; the server's
  `end` handler clears `busy` on both sides, freeing us immediately.

### Result
Two users can reliably see each other on the map, dots appear/disappear with
presence, requests connect, text chat flows both ways, and video negotiates —
end to end.

## Phase 2 — Make it good

No mockup was given, so I committed to a single clear direction: a calm,
monochrome, Apple-adjacent aesthetic (`#f5f5f7` / `#1d1d1f`) with motion that
sells the "living globe" idea, and full light **and** dark mode. The old UI was
generic Tailwind zinc + emerald; every surface was reworked to the new system.

### Theme system (light/dark)
- `app/components/theme.tsx` — a tiny store over `useSyncExternalStore`. `.dark`
  is toggled on `<html>`; `setPulseTheme` persists the choice to `localStorage`
  and fires a custom event so every subscriber re-renders. `ThemeToggle` is a
  reusable sun/moon button.
- `app/layout.tsx` — a pre-paint inline script reads `localStorage`/system
  preference and sets `.dark` **before** first paint, killing the flash of the
  wrong theme. `suppressHydrationWarning` covers the server/client mismatch.
- `app/globals.css` — `@custom-variant dark`, CSS vars (`--background`,
  `--foreground`) flipped under `.dark`, and Tailwind v4 `@theme` wiring. Fonts
  added: Space Grotesk (display) + Sora (entry screen). Icons via `lucide-react`.

### Entry screen — the centerpiece
`EntryGate` was rebuilt from a plain card into a timed reveal sequence:
- A short **prelude** ("Bored? / Drop into Pulse. / Tap a dot. / Talk to the
  world.") plays, then the hero animates in — brand letters, word-by-word
  headline, button pop, fine print — all driven by staggered CSS keyframe delays
  off a shared `--entry-page-delay`.
- Slow-drifting monochrome **orbs** behind everything for depth.
- The **Enter** button is magnetic: `onPointerMove` tracks the cursor and drives
  CSS vars for a 3D tilt, slight follow-shift, scale, and a radial glow that
  follows the pointer; it eases back to rest on leave.
- Accessibility: real text is in `sr-only` spans (animated copies are
  `aria-hidden`), and a `prefers-reduced-motion` block disables orbs, reveals,
  and tilt for users who opt out.

### Component restyles
- **WorldMap** — map style is now theme-aware (`light-v11` / `dark-v11`) and
  swaps live via `setStyle` when the theme changes; the "online" count chip and
  token-missing notice were restyled to the glass/monochrome look.
- **ChatPanel** — monochrome bubbles, `Video`/`X` icons, and a new accessible
  **"End chat?" confirmation modal** (`role="dialog"`, `aria-modal`, labelled +
  described, Escape to close, focus moved to Cancel on open and back to the End
  button on close) so a call isn't dropped by a stray tap.
- **ConnectionPrompt** and all `page.tsx` overlays (notice toast, "requesting",
  video-waiting) moved to the same palette with subtle borders + backdrop blur.

### Dev tooling (not user-facing)
`lib/echobot.ts` + a `DUMMY_ENABLED` flag in `page.tsx` add an optional local
**echo peer** — a fake test dot near you that loops chat/video back, so the full
connect flow can be exercised solo without a second browser. Shipped **off**
(`DUMMY_ENABLED = false`).

## Phase 3 — Make it secure

### The core flaw
There are no accounts (by design), but the client-generated session UUID was used
as **both** the public peer id (broadcast to everyone in `/api/poll`) **and** the
only credential. Since every online user's id is handed to every other client,
anyone could act *as* or *on* anyone.

### Findings, ranked
| Pri | Issue | What it let an attacker do |
|-----|-------|-----------------------------|
| **P0** | Session id = public identity AND sole credential | Impersonate any user (forge `fromId` in `/api/signal`), forcibly evict anyone (`/api/leave` with their id), hijack/tear-down calls, and "busy-grief" (mark any two strangers unavailable via `accept`) |
| **P1** | No rate limiting; `/api/poll` returned ALL peers uncapped | Hammer Postgres → connection/cost exhaustion; spam `/api/join` → flood every client's map with fake dots |
| **P1** | Any-origin API access (no credential/origin binding) | Any third-party website could drive the API |
| **P2** | Signal mailbox uncapped per recipient/sender | Flood a victim's inbox with junk / fake prompts |
| **P2** | `signal`/`leave` ids only checked `typeof === string`; self-signal allowed | Oversized/malformed actor ids |
| **P3** | Raw lat/lng sent to server | Momentary exact-location exposure (offset is server-side, raw never stored) — accepted trade-off |
| **P3** | No security headers | Clickjacking / asset-injection surface |

### What I fixed

**P0 — Server-issued session token (the key fix).**
- `/api/join` now mints a per-session secret `token` (`crypto.randomUUID()`),
  stores it on the `Presence` row (new column, **never** returned in `/api/poll`),
  and returns it once to the caller. Join is `create`-not-`upsert`: a duplicate id
  → `409` (blocks id takeover).
- Every mutating call proves ownership via `verifyOwner(id, token)` with a
  constant-time compare (`lib/auth.ts`):
  - `/api/poll` — token must match the polled `id` (header `X-Pulse-Token`).
  - `/api/signal` — token must match `fromId`. This single check kills
    impersonation, forged accept/end, and busy-griefing at once.
  - `/api/leave` — token must match `id`. Blocks forced eviction. (`sendBeacon`
    can't set headers, so the token rides in the body here.)
- The peer id stays public (it's the signaling address) but is now useless without
  the secret. Anonymity is preserved — the token is ephemeral, no PII, dropped on
  leave/staleness.
- **CSRF bonus:** requiring a custom `X-Pulse-Token` header on poll/signal means
  browsers won't send it cross-origin without a CORS preflight we never grant.

**P1 — Rate limiting (`lib/ratelimit.ts`).** Postgres-backed fixed window (new
`RateLimit` table) — chosen because the brief forbids external services (no
Redis/Upstash) and in-memory wouldn't survive serverless. Per-IP limits: join
10/min, poll 120/min, signal 60/min, leave 30/min → `429` + `Retry-After`. Expired
windows are reaped opportunistically inside `/api/poll`.

**P1 — Peer cap.** `/api/poll` now returns at most 500 peers (newest-first),
bounding payload and client render under a join-flood.

**P2 — Mailbox caps.** `/api/signal` rejects when a recipient already has ≥50
pending signals, or ≥10 from the same sender.

**P2 — Validation.** Shared `isValidSessionId` (length 8–64) applied to
`signal`/`leave`; self-signal (`fromId === toId`) rejected.

**P3 — Security headers (`next.config.ts`).** CSP (scoped to allow Mapbox + WebRTC),
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `Permissions-Policy` limiting camera/mic/geo to
self, and HSTS.

### Verified (curl matrix against the live Neon DB)
join → token; duplicate id → 409; poll without/with-wrong token → 401, correct →
200; forged `fromId` (no token / wrong token) → 401 (impersonation blocked); leave
with wrong token → 401 (eviction blocked); self-signal → 400; rate limit → exactly
10 then 429 with `Retry-After`; mailbox pair cap → 10 then 429; CSP + headers
present; full connect→busy→end happy path still works with tokens.

### Accepted trade-offs / next steps
- **Raw coordinates (P3):** the client still sends raw lat/lng so the server can
  apply the trusted privacy offset; raw is never stored. Doing the offset
  client-side would avoid transmitting exact coords but lets a malicious client
  skip it — server-side is the safer default. Worth a hybrid (client offset +
  server jitter) with more time.
- **Fixed-window rate limiting** is slightly bursty at window edges vs a sliding
  window; a dedicated store would be more precise but violates the no-external-
  services constraint.
- `'unsafe-eval'` is in the CSP for Next dev HMR; it could be dropped in a
  prod-only build to tighten further.
