"use client";

// Client-side workspace state. The truth lives in a cookie so server APIs can
// read it on every request; this context keeps an in-memory + localStorage
// mirror so the sidebar UI updates instantly when switched.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const COOKIE = "aitasks_workspace";
const STORAGE_KEY = "aitasks_workspace";

export type Workspace = { kind: "personal" } | { kind: "team"; teamId: string };

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  return m ? decodeURIComponent(m.split("=")[1]) : null;
}

function writeCookie(value: string) {
  if (typeof document === "undefined") return;
  // 1-year lifetime; SameSite=Lax so it ships on top-level navigations too.
  document.cookie = `${COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

function fromString(s: string | null): Workspace {
  if (!s || s === "personal") return { kind: "personal" };
  return { kind: "team", teamId: s };
}
function toString(w: Workspace): string {
  return w.kind === "personal" ? "personal" : w.teamId;
}

type Ctx = {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [workspace, setWorkspaceState] = useState<Workspace>(() => {
    if (typeof window === "undefined") return { kind: "personal" };
    // Cookie wins on first paint so it matches what the server saw on SSR.
    const fromCookie = readCookie();
    if (fromCookie) return fromString(fromCookie);
    const fromStorage = window.localStorage.getItem(STORAGE_KEY);
    return fromString(fromStorage);
  });

  // Mirror to localStorage so multiple tabs see the same value.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, toString(workspace));
    } catch {
      /* ignore */
    }
  }, [workspace]);

  const setWorkspace = useCallback(
    (w: Workspace) => {
      writeCookie(toString(w));
      setWorkspaceState(w);
      // Server components / API responses depend on the cookie — refresh so
      // freshly-rendered data reflects the new workspace.
      router.refresh();
    },
    [router],
  );

  return (
    <WorkspaceContext.Provider value={{ workspace, setWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
