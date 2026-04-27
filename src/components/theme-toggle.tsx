"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// Light/dark toggle. The repo uses next-themes (already installed).
// `compact` collapses to icon-only for the header.
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current = (theme === "system" ? resolvedTheme : theme) ?? "dark";
  const next = current === "dark" ? "light" : "dark";
  const icon = current === "dark" ? "☀️" : "🌙";

  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
      className="inline-flex items-center justify-center rounded-md p-2 text-sm hover:bg-accent"
    >
      <span className="text-base">{icon}</span>
      {!compact ? <span className="ml-2">{current === "dark" ? "Light" : "Dark"}</span> : null}
    </button>
  );
}
