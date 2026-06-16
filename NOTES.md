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
