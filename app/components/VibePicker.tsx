"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { VIBES, VIBE_BY_ID } from "@/lib/vibes";

// Live-map control to change your own vibe after entering. Shows the current
// vibe as a colored pill; clicking opens a small popover with the fixed vibe
// set. Selecting one calls onChange (which updates state + persists server-side).
export default function VibePicker({
  vibe,
  onChange,
}: {
  vibe: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = vibe ? VIBE_BY_ID[vibe] : null;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Change your vibe"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-[#1d1d1f]/10 bg-white/80 px-3.5 text-sm font-medium text-[#1d1d1f] shadow-lg backdrop-blur transition-colors duration-200 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1f] dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/80 dark:text-[#f5f5f7] dark:hover:bg-[#1d1d1f] dark:focus-visible:outline-[#f5f5f7]"
        style={current ? { color: current.color } : undefined}
      >
        <span aria-hidden>{current?.emoji ?? "✨"}</span>
        {current?.label ?? "Set vibe"}
        <ChevronDown
          aria-hidden="true"
          size={15}
          strokeWidth={2}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-2 flex w-44 flex-col gap-0.5 rounded-2xl border border-[#1d1d1f]/10 bg-white/95 p-1.5 shadow-2xl backdrop-blur dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/95"
        >
          {VIBES.map((v) => {
            const active = v.id === vibe;
            return (
              <button
                key={v.id}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(v.id);
                  setOpen(false);
                }}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors duration-150 hover:bg-[#1d1d1f]/5 dark:hover:bg-[#f5f5f7]/8"
                style={{
                  backgroundColor: active ? `${v.color}1f` : undefined,
                  color: active ? v.color : undefined,
                }}
              >
                <span aria-hidden>{v.emoji}</span>
                {v.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
