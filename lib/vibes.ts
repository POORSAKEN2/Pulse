// Vibes — an ephemeral, single-word "what are you here for" tag a user picks on
// entry. It rides the Presence row (dies on leave like everything else), colors
// the user's dot, and lets people filter the map for someone on the same
// wavelength. No free text, so there's nothing to moderate: the set is fixed
// and shared by client + server.

export interface Vibe {
  id: string;
  emoji: string;
  label: string;
  color: string; // dot color (works on both light + dark map styles)
}

export const VIBES: Vibe[] = [
  { id: "chat", emoji: "💬", label: "Just chat", color: "#5b8def" },
  { id: "music", emoji: "🎧", label: "Music", color: "#b06ef0" },
  { id: "gaming", emoji: "🎮", label: "Gaming", color: "#3fb950" },
  { id: "deep", emoji: "🌊", label: "Deep talk", color: "#2dd4bf" },
  { id: "night", emoji: "🌙", label: "Night owl", color: "#f0a93f" },
  { id: "fun", emoji: "🎉", label: "Fun", color: "#f0506e" },
];

export const VIBE_IDS = VIBES.map((v) => v.id);

export const VIBE_BY_ID: Record<string, Vibe> = Object.fromEntries(
  VIBES.map((v) => [v.id, v]),
);

export const DEFAULT_VIBE = VIBES[0].id;

// Bounds what a client may write into its Presence row. A missing vibe is
// allowed (older clients / opt-out); anything outside the fixed set is rejected.
export function isValidVibe(x: unknown): x is string {
  return typeof x === "string" && VIBE_IDS.includes(x);
}
