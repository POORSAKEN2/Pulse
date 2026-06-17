"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";
import { VIBES, VIBE_BY_ID } from "@/lib/vibes";
import { getCurrentTheme, usePulseTheme } from "./theme";

// No fallback: a placeholder token loads a broken (blank, 401-ing) map with no
// signal to the user. Leave it falsy when unset so the `!TOKEN` notice shows.
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MAP_STYLE_BY_THEME = {
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
} as const;

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
}

// A dot's color comes from its vibe so people on the same wavelength read at a
// glance; if a peer has no vibe we fall back to the old per-id hash color.
function dotColor(peer: PeerDot): string {
  const v = peer.vibe ? VIBE_BY_ID[peer.vibe] : undefined;
  return v ? v.color : hashColor(peer.id);
}

export default function WorldMap({
  peers,
  me,
  myVibe,
  onPeerClick,
  canConnect,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  myVibe: string | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  // The "connect" card: which peer it's open for + its screen position. Rendered
  // as a React overlay (not a Mapbox popup) so it's Tailwind-styled and reliable.
  const [card, setCard] = useState<{ peer: PeerDot; x: number; y: number } | null>(
    null,
  );
  const cardPeerRef = useRef<PeerDot | null>(null);
  // Latest peer data by id + a stable opener, so a dot's click handler (bound
  // once at creation) always opens the card with fresh data (e.g. busy state).
  const peerByIdRef = useRef<Map<string, PeerDot>>(new Map());
  const openCardRef = useRef<((id: string) => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [vibeFilter, setVibeFilter] = useState<string | null>(null);
  const theme = usePulseTheme();

  // When a vibe filter is on, only those dots render (and get counted).
  const visiblePeers = vibeFilter
    ? peers.filter((p) => p.vibe === vibeFilter)
    : peers;

  // Marker click handlers are bound once, so read the live click handler +
  // connectability through refs (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  const closeCard = useCallback(() => setCard(null), []);

  // Mirror the open card's peer into a ref so map-move/reconcile (which run
  // outside render) can read the latest without a stale closure.
  useEffect(() => {
    cardPeerRef.current = card?.peer ?? null;
  }, [card]);

  // Keep the open card glued to its peer's pin as the map pans/zooms, and close
  // it on a background map click.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const reposition = () => {
      const p = cardPeerRef.current;
      if (!p) return;
      const pt = map.project([p.lng, p.lat]);
      setCard((c) => (c ? { ...c, x: pt.x, y: pt.y } : c));
    };
    map.on("move", reposition);
    map.on("click", closeCard);
    return () => {
      map.off("move", reposition);
      map.off("click", closeCard);
    };
  }, [ready, closeCard]);

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAP_STYLE_BY_THEME[getCurrentTheme()],
        // Open centered on the user if we know where they are, else world view.
        center: me ? [me.lng, me.lat] : [0, 20],
        zoom: me ? 4 : 1.4,
        attributionControl: true,
      });
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      cardPeerRef.current = null;
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `me` is only read for the initial center; we don't want to re-init on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLE_BY_THEME[theme]);
  }, [theme]);

  // Show / move the user's own "you are here" pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    // The label above your pin shows your chosen vibe (emoji + label, tinted to
    // the vibe color) so you can see what you're broadcasting; falls back to "Me".
    const vibe = myVibe ? VIBE_BY_ID[myVibe] : undefined;
    const labelText = vibe ? `${vibe.emoji} ${vibe.label}` : "Me";

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You are here";
        const label = document.createElement("span");
        label.className = "pulse-me-label";
        meMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
        el.appendChild(label);
        el.appendChild(document.createTextNode("📍"));
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
      // (Re)apply the label text + vibe tint on the live marker element.
      const label = meMarkerRef.current
        .getElement()
        .querySelector<HTMLElement>(".pulse-me-label");
      if (label) {
        label.textContent = labelText;
        label.style.background = vibe ? vibe.color : "";
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready, myVibe]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();
      peerByIdRef.current = new Map(visiblePeers.map((p) => [p.id, p]));

      // Open a small card above a peer's pin showing their vibe + a Connect
      // button. Tapping a dot no longer connects directly — it opens this card.
      const openCard = (id: string) => {
        const peer = peerByIdRef.current.get(id);
        if (!peer) return;
        cardPeerRef.current = peer;
        const pt = map.project([peer.lng, peer.lat]);
        setCard({ peer, x: pt.x, y: pt.y });
      };
      openCardRef.current = openCard;

      for (const peer of visiblePeers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.className = "pulse-dot";
          el.style.background = dotColor(peer);
          const vibe = peer.vibe ? VIBE_BY_ID[peer.vibe] : undefined;
          el.title = vibe ? `${vibe.label} · tap to connect` : "Tap to connect";
          // Float the peer's vibe emoji above their dot so others can read it at
          // a glance (the color already encodes it; the emoji makes it explicit).
          if (vibe) {
            const tag = document.createElement("span");
            tag.className = "pulse-dot-vibe";
            tag.textContent = vibe.emoji;
            el.appendChild(tag);
          }
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            openCardRef.current?.(peer.id);
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }
        marker.getElement().style.opacity = peer.busy ? "0.35" : "1";
      }

      // Drop markers for peers that went offline / got filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }

      // Keep an open card current: drop it if we can no longer connect or the
      // peer is gone / filtered out, else refresh its peer data (busy flips).
      const open = cardPeerRef.current;
      if (open) {
        const latest = peerByIdRef.current.get(open.id);
        if (!canConnect || !latest) {
          closeCard();
        } else {
          cardPeerRef.current = latest;
          setCard((c) => (c ? { ...c, peer: latest } : c));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visiblePeers, ready, canConnect, closeCard]);

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="h-full w-full bg-[#f5f5f7] dark:bg-[#1d1d1f]"
      />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-md rounded-lg bg-white/90 p-4 text-sm text-[#1d1d1f] shadow-lg backdrop-blur dark:bg-[#1d1d1f]/90 dark:text-[#f5f5f7]">
            Set{" "}
            <code className="text-[#1d1d1f] dark:text-[#f5f5f7]">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> to load the map.
          </p>
        </div>
      )}

      {/* Connect card — opens above a peer's pin when you tap their dot. */}
      {card &&
        canConnect &&
        (() => {
          const vibe = card.peer.vibe ? VIBE_BY_ID[card.peer.vibe] : undefined;
          const connectable = canConnect && !card.peer.busy;
          return (
            <div
              className="pointer-events-none absolute z-20"
              style={{
                left: card.x,
                top: card.y,
                transform: "translate(-50%, calc(-100% - 18px))",
              }}
            >
              <div className="pointer-events-auto flex min-w-[136px] flex-col gap-2 rounded-2xl border border-[#1d1d1f]/10 bg-white/95 p-2.5 shadow-2xl backdrop-blur dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/95">
                <span
                  className="flex items-center gap-1.5 px-1 text-sm font-semibold"
                  style={{ color: vibe?.color }}
                >
                  {vibe ? (
                    <>
                      <span aria-hidden>{vibe.emoji}</span>
                      {vibe.label}
                    </>
                  ) : (
                    "Stranger"
                  )}
                </span>
                <button
                  type="button"
                  disabled={!connectable}
                  onClick={() => {
                    onPeerClick(card.peer.id);
                    closeCard();
                  }}
                  className="cursor-pointer rounded-full bg-[#1d1d1f] px-4 py-1.5 text-sm font-semibold text-[#f5f5f7] transition-colors duration-200 hover:bg-black disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[#f5f5f7] dark:text-[#1d1d1f] dark:hover:bg-white"
                >
                  {card.peer.busy ? "In a chat" : connectable ? "Connect" : "Busy"}
                </button>
              </div>
            </div>
          );
        })()}

      {/* Vibe filter — tap a vibe to show only those dots; tap again to clear. */}
      <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full border border-[#1d1d1f]/10 bg-white/80 p-1.5 shadow-lg backdrop-blur dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/80">
          {VIBES.map((v) => {
            const active = vibeFilter === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVibeFilter(active ? null : v.id)}
                aria-pressed={active}
                title={`Show ${v.label}`}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-[background-color,color] duration-200"
                style={{
                  backgroundColor: active ? v.color : "transparent",
                  color: active ? "#fff" : "inherit",
                }}
              >
                <span aria-hidden>{v.emoji}</span>
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Online count */}
      <div className="absolute bottom-4 left-4 rounded-full border border-[#1d1d1f]/10 bg-white/80 px-3 py-1.5 text-xs text-[#1d1d1f]/70 shadow-lg backdrop-blur dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/80 dark:text-[#f5f5f7]/70">
        {vibeFilter
          ? `${visiblePeers.length} ${VIBE_BY_ID[vibeFilter]?.label ?? ""} · ${peers.length} online`
          : `${peers.length} online`}
      </div>
    </div>
  );
}
