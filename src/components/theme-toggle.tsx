"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");

  // Load on mount
  useEffect(() => {
    const stored = (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY)) as Theme | null;
    const initial = stored ?? "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  // React to system changes when theme=system
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function setAndApply(next: Theme) {
    setTheme(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
    applyTheme(next);
  }

  if (compact) {
    // Single-icon click cycles light → dark → system
    const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
    return (
      <button
        type="button"
        onClick={() => setAndApply(next)}
        className="h-9 w-9 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
        title={`Theme: ${theme} (click for ${next})`}
        aria-label="Toggle theme"
      >
        <Icon size={15} />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-white/10 p-0.5 bg-gray-50 dark:bg-white/5">
      {(["light", "system", "dark"] as Theme[]).map((t) => {
        const Icon = t === "light" ? Sun : t === "dark" ? Moon : Monitor;
        return (
          <button
            key={t}
            type="button"
            onClick={() => setAndApply(t)}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded-md transition-colors capitalize",
              theme === t
                ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-400 hover:text-gray-700 dark:hover:text-white/80"
            )}
            title={t}
          >
            <Icon size={13} />
          </button>
        );
      })}
    </div>
  );
}

// Inline script for setting theme before hydration to prevent flash
export const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('theme') || 'light';
    var isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
