"use client";

import { useCallback, useRef, useState } from "react";

/**
 * useOptimistic — small primitive for fast, optimistic mutations.
 *
 * Pattern:
 *   const [items, mutate] = useOptimistic(initialItems);
 *   mutate(
 *     (prev) => prev.map(t => t.id === id ? { ...t, ...patch } : t),    // local apply
 *     async () => {
 *       const r = await fetch(`/api/x/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
 *       return r.ok;
 *     }
 *   );
 *
 * If the request fails, the previous state is automatically restored and the error
 * callback is invoked.
 */
export function useOptimistic<T>(initial: T) {
  const [state, setState] = useState<T>(initial);
  const stateRef = useRef<T>(initial);
  stateRef.current = state;

  const mutate = useCallback(
    async (
      apply: (prev: T) => T,
      commit: () => Promise<boolean | { ok: boolean; data?: T }>,
      onError?: (err: unknown) => void,
    ) => {
      const prev = stateRef.current;
      const next = apply(prev);
      setState(next);
      try {
        const res = await commit();
        const ok = typeof res === "boolean" ? res : res.ok;
        if (!ok) {
          setState(prev);
          onError?.(new Error("Commit returned not-ok"));
          return false;
        }
        if (typeof res === "object" && res.data !== undefined) {
          setState(res.data);
        }
        return true;
      } catch (err) {
        setState(prev);
        onError?.(err);
        return false;
      }
    },
    [],
  );

  return [state, setState, mutate] as const;
}

/**
 * Helper to JSON-fetch with sane defaults and consistent error shape.
 */
export async function jsonFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    let data: T | undefined;
    let error: string | undefined;
    try {
      const json = await res.json();
      if (res.ok) data = json as T;
      else error = (json as { error?: string }).error ?? `HTTP ${res.status}`;
    } catch {
      if (!res.ok) error = `HTTP ${res.status}`;
    }
    return { ok: res.ok, status: res.status, data, error };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Network error" };
  }
}
