"use client";

import { useSyncExternalStore } from "react";

const THEME_CHANGE_EVENT = "pulse-theme-change";

export type Theme = "light" | "dark";

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

export function getCurrentTheme(): Theme {
  return getThemeSnapshot();
}

export function usePulseTheme() {
  return useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
}

export function setPulseTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {}
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function togglePulseTheme(currentTheme: Theme) {
  setPulseTheme(currentTheme === "dark" ? "light" : "dark");
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = usePulseTheme();

  return (
    <button
      type="button"
      suppressHydrationWarning
      onClick={() => togglePulseTheme(theme)}
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      className={className}
    >
      {theme === "dark" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
