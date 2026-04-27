"use client";

import { useCommandPalette } from "@/components/command-palette";

export function GlobalSearch() {
  const { open } = useCommandPalette();

  return (
    <>
      <button
        onClick={() => open()}
        className="md:hidden h-11 w-11 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
        type="button"
        aria-label="Search"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </button>
      <button
        onClick={() => open()}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border bg-background text-muted-foreground text-sm hover:bg-accent transition-colors w-full"
        type="button"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="flex-1 text-left">Search...</span>
        <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded border font-mono text-muted-foreground">
          {"\u2318"}K
        </kbd>
      </button>
    </>
  );
}
