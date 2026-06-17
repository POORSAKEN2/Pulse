"use client";

import { Sora } from "next/font/google";
import Image from "next/image";
import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { ThemeToggle } from "./theme";
import { VIBES, DEFAULT_VIBE } from "@/lib/vibes";

const sora = Sora({
  subsets: ["latin"],
});

type MotionButtonStyle = CSSProperties & {
  "--button-glow-x": string;
  "--button-glow-y": string;
  "--button-glow-opacity": string;
  "--button-rotate-x": string;
  "--button-rotate-y": string;
  "--button-scale": string;
  "--button-shift-x": string;
  "--button-shift-y": string;
};

const MOTION_BUTTON_REST_STYLE: MotionButtonStyle = {
  "--button-glow-x": "50%",
  "--button-glow-y": "50%",
  "--button-glow-opacity": "0",
  "--button-rotate-x": "0deg",
  "--button-rotate-y": "0deg",
  "--button-scale": "1",
  "--button-shift-x": "0px",
  "--button-shift-y": "0px",
};

const MOTION_FIELD_REACH = 150;
const ENTRY_SEQUENCE_DELAY_MS = 2_800;
const PRELUDE_LINES = [
  "Bored?",
  "Drop into Pulse.",
  "Tap a dot.",
  "Talk to the world.",
];
const HERO_REVEAL_WORDS = [
  "A",
  "living",
  "globe",
  "of",
  "anonymous",
  "strangers.",
  "Drop",
  "onto",
  "the",
  "map,",
  "tap",
  "a",
  "dot,",
  "and",
  "start",
  "talking.",
];
const HERO_REVEAL_TEXT = HERO_REVEAL_WORDS.join(" ");
const BRAND_REVEAL_LETTERS = ["P", "u", "l", "s", "e"];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number, vibe: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [vibe, setVibe] = useState<string>(DEFAULT_VIBE);
  const enterButtonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  function moveCursorGradient(event: PointerEvent<HTMLElement>) {
    const root = rootRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    root.style.setProperty("--cursor-x", `${event.clientX - rect.left}px`);
    root.style.setProperty("--cursor-y", `${event.clientY - rect.top}px`);
    root.style.setProperty("--cursor-opacity", "1");
  }

  function hideCursorGradient() {
    rootRef.current?.style.setProperty("--cursor-opacity", "0");
  }

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => onReady(pos.coords.latitude, pos.coords.longitude, vibe),
      (err) => {
        setStatus("error");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is required to place you on the map."
            : "Couldn't get your location. Please try again.",
        );
      },
      // High accuracy + maximumAge:0 forces a fresh fix (Wi-Fi/GPS scan)
      // instead of reusing the browser's cached IP-based location.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  function moveEnterButton(event: PointerEvent<HTMLElement>) {
    if (status === "locating") return;

    const button = enterButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const xFromCenter = clamp(
      (event.clientX - centerX) / (rect.width / 2),
      -1,
      1,
    );
    const yFromCenter = clamp(
      (event.clientY - centerY) / (rect.height / 2),
      -1,
      1,
    );
    const distanceFromCenter = Math.hypot(
      event.clientX - centerX,
      event.clientY - centerY,
    );
    const maxDistance = Math.hypot(rect.width, rect.height) / 2 + MOTION_FIELD_REACH;
    const proximity = 1 - clamp(distanceFromCenter / maxDistance, 0, 1);
    const strength = proximity ** 1.4;
    const glowX = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const glowY = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

    button.style.setProperty("--button-glow-x", `${glowX}%`);
    button.style.setProperty("--button-glow-y", `${glowY}%`);
    button.style.setProperty("--button-glow-opacity", `${0.25 + strength * 0.75}`);
    button.style.setProperty("--button-rotate-x", `${yFromCenter * -16 * strength}deg`);
    button.style.setProperty("--button-rotate-y", `${xFromCenter * 18 * strength}deg`);
    button.style.setProperty("--button-shift-x", `${xFromCenter * 12 * strength}px`);
    button.style.setProperty("--button-shift-y", `${yFromCenter * 9 * strength}px`);
    button.style.setProperty("--button-scale", `${1 + strength * 0.06}`);
  }

  function resetEnterButton() {
    const button = enterButtonRef.current;
    if (!button) return;

    for (const [property, value] of Object.entries(MOTION_BUTTON_REST_STYLE)) {
      button.style.setProperty(property, value);
    }
  }

  return (
    <div
      ref={rootRef}
      onPointerMove={moveCursorGradient}
      onPointerLeave={hideCursorGradient}
      style={
        {
          "--cursor-x": "50%",
          "--cursor-y": "50%",
          "--cursor-opacity": "0",
        } as CSSProperties
      }
      className={`${sora.className} relative isolate flex min-h-full flex-1 flex-col items-center justify-center overflow-hidden bg-[#f5f5f7] px-6 text-[#1d1d1f] dark:bg-[#1d1d1f] dark:text-[#f5f5f7]`}
    >
      {/* Cursor-following gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: "var(--cursor-opacity)",
          background:
            "radial-gradient(420px circle at var(--cursor-x) var(--cursor-y), rgba(29,29,31,0.12), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden transition-opacity duration-300 dark:block"
        style={{
          opacity: "var(--cursor-opacity)",
          background:
            "radial-gradient(420px circle at var(--cursor-x) var(--cursor-y), rgba(245,245,247,0.14), transparent 70%)",
        }}
      />

      {/* Moving monochrome backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="orb orb-a left-[-10%] top-[-10%] h-[42rem] w-[42rem] bg-[#1d1d1f]/10 dark:bg-[#f5f5f7]/10" />
        <div className="orb orb-b right-[-12%] top-[6%] h-[38rem] w-[38rem] bg-white/80 dark:bg-black/30" />
        <div className="orb orb-c bottom-[-14%] left-[18%] h-[40rem] w-[40rem] bg-[#1d1d1f]/5 dark:bg-[#f5f5f7]/8" />
      </div>

      <div className="entry-prelude" aria-hidden>
        <div className="entry-prelude-stack">
          {PRELUDE_LINES.map((line, index) => (
            <span
              key={line}
              className="entry-prelude-line"
              style={{ animationDelay: `${260 + index * 460}ms` }}
            >
              {line}
            </span>
          ))}
        </div>
      </div>

      {/* Theme toggle */}
      <ThemeToggle className="entry-reveal entry-delay-4 absolute right-5 top-5 grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-[#1d1d1f]/15 bg-white/70 text-[#1d1d1f] backdrop-blur-md transition-colors duration-200 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1f] dark:border-[#f5f5f7]/15 dark:bg-[#f5f5f7]/5 dark:text-[#f5f5f7] dark:hover:bg-[#f5f5f7]/10 dark:focus-visible:outline-[#f5f5f7]" />

      {/* Hero content */}
      <div className="relative w-full max-w-7xl p-8 text-center sm:p-10">
        <span className="entry-reveal entry-delay-1 inline-flex items-center gap-2 rounded-full border border-[#1d1d1f]/15 bg-white/60 px-3 py-1.5 text-sm font-medium tracking-normal text-[#1d1d1f]/70 dark:border-[#f5f5f7]/15 dark:bg-[#f5f5f7]/5 dark:text-[#f5f5f7]/75">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1d1d1f] opacity-30 dark:bg-[#f5f5f7]" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1d1d1f] dark:bg-[#f5f5f7]" />
          </span>
          Live now · anonymous
        </span>

        <p className="brand-reveal mt-6 text-sm font-bold tracking-normal sm:text-7xl">
          <span className="sr-only">Pulse</span>
          {BRAND_REVEAL_LETTERS.map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              aria-hidden
              className="brand-reveal-letter"
              style={{
                animationDelay: `${ENTRY_SEQUENCE_DELAY_MS + 120 + index * 72}ms`,
              }}
            >
              {letter}
            </span>
          ))}
        </p>

        <p className="text-reveal mx-auto mt-5 max-w-7xl text-3xl font-semibold leading-relaxed text-[#1d1d1f] dark:text-[#f5f5f7] sm:text-5xl">
          <span className="sr-only">{HERO_REVEAL_TEXT}</span>
          {HERO_REVEAL_WORDS.map((word, index) => (
            <span
              key={`${word}-${index}`}
              aria-hidden
              className="text-reveal-word"
              style={{
                animationDelay: `${ENTRY_SEQUENCE_DELAY_MS + 220 + index * 58}ms`,
              }}
            >
              {word}
            </span>
          ))}
          <span
            aria-hidden
            className="text-reveal-media mx-1 inline-flex size-12 translate-y-2 items-center justify-center sm:mx-2 sm:size-16"
            style={{
              animationDelay: `${
                ENTRY_SEQUENCE_DELAY_MS + 220 + HERO_REVEAL_WORDS.length * 58
              }ms`,
            }}
          >
            <Image
              src="/entry-chat.svg"
              alt="Chat preview"
              width={64}
              height={64}
              className="h-full w-full object-cover"
            />
          </span>
        </p>

        <div className="note-reveal mx-auto mt-8 flex max-w-lg flex-col items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-[#1d1d1f]/45 dark:text-[#f5f5f7]/45">
            Pick your vibe
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {VIBES.map((v) => {
              const active = v.id === vibe;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVibe(v.id)}
                  aria-pressed={active}
                  className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    borderColor: active ? v.color : "transparent",
                    backgroundColor: active ? `${v.color}1f` : "rgba(127,127,127,0.1)",
                    color: active ? v.color : "inherit",
                    outlineColor: v.color,
                  }}
                >
                  <span aria-hidden>{v.emoji}</span>
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="button-reveal -mx-10 -mb-10 mt-[-0.25rem] inline-flex p-10"
          onPointerMove={moveEnterButton}
          onPointerLeave={resetEnterButton}
        >
          <button
            ref={enterButtonRef}
            onClick={enter}
            onPointerDown={moveEnterButton}
            onPointerUp={resetEnterButton}
            disabled={status === "locating"}
            style={{
              ...MOTION_BUTTON_REST_STYLE,
              transform:
                "perspective(700px) translate3d(var(--button-shift-x), var(--button-shift-y), 0) rotateX(var(--button-rotate-x)) rotateY(var(--button-rotate-y)) scale(var(--button-scale))",
            }}
            className="group relative inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full bg-[#1d1d1f] px-6 py-3 text-base font-semibold text-[#f5f5f7] shadow-lg shadow-[#1d1d1f]/15 transition-[background-color,box-shadow,opacity,transform] duration-200 ease-out hover:bg-black hover:shadow-xl hover:shadow-[#1d1d1f]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1f] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#f5f5f7] dark:text-[#1d1d1f] dark:shadow-black/25 dark:hover:bg-white dark:focus-visible:outline-[#f5f5f7]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 transition-opacity duration-150"
              style={{
                opacity: "var(--button-glow-opacity)",
                background:
                  "radial-gradient(circle at var(--button-glow-x) var(--button-glow-y), rgba(255,255,255,0.42), transparent 42%)",
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-px rounded-full border border-white/20 mix-blend-overlay dark:border-black/10"
            />
            {status === "locating" ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-90"
                    fill="currentColor"
                    d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                  />
                </svg>
                <span className="relative">Locating…</span>
              </>
            ) : (
              <>
                <span className="relative">Enter Pulse</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="relative h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </>
            )}
          </button>
        </div>

        {status === "error" && (
          <p
            className="entry-reveal mt-4 text-sm text-red-500 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        )}

        <p className="note-reveal mx-auto mt-6 max-w-lg text-sm leading-relaxed text-[#1d1d1f]/55 dark:text-[#f5f5f7]/55">
          No sign-up. Your dot is placed 1–3&nbsp;km from your real location.
          Nothing is stored — closing the tab ends everything.
        </p>
      </div>
    </div>
  );
}
