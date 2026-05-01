"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, RefreshCw, AlertTriangle, Clock, Flame, FolderOpen, Loader2, ChevronDown, ChevronUp, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Spec keys (Sprint 1)
const COLLAPSED_KEY = "jarvis_collapsed";
const NOT_CONFIGURED_DISMISSED_KEY = "jarvis_banner_dismissed";

// Migrate legacy keys (silent best-effort)
if (typeof window !== "undefined") {
  try {
    const legacyCollapsed = window.localStorage.getItem("jarvis:collapsed");
    if (legacyCollapsed && !window.localStorage.getItem(COLLAPSED_KEY)) {
      window.localStorage.setItem(COLLAPSED_KEY, legacyCollapsed);
      window.localStorage.removeItem("jarvis:collapsed");
    }
    const legacyDismissed = window.localStorage.getItem("jarvis:not_configured_dismissed");
    if (legacyDismissed && !window.localStorage.getItem(NOT_CONFIGURED_DISMISSED_KEY)) {
      window.localStorage.setItem(NOT_CONFIGURED_DISMISSED_KEY, legacyDismissed);
      window.localStorage.removeItem("jarvis:not_configured_dismissed");
    }
  } catch {}
}

type Briefing = {
  briefing: string;
  stats?: {
    overdue: number;
    today: number;
    urgent: number;
    upcoming: number;
    projects: number;
  };
  error?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  "What should I focus on first?",
  "Summarize my week",
  "Which campaigns need attention?",
  "Draft a status update",
];

export function JarvisOverview() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  // Initialize from localStorage synchronously on the client to avoid hydration races.
  // This prevents the click→state→re-render cycle from racing the persisted-state effect.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  });
  const [notConfiguredDismissed, setNotConfiguredDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(NOT_CONFIGURED_DISMISSED_KEY) === "1";
  });
  const endRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  function toggleCollapsed(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  function dismissNotConfigured(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    try { window.localStorage.setItem(NOT_CONFIGURED_DISMISSED_KEY, "1"); } catch {}
    setNotConfiguredDismissed(true);
  }

  async function fetchBriefing() {
    setLoadingBrief(true);
    try {
      const res = await fetch("/api/ai/jarvis");
      const data = await res.json();
      // Treat any non-2xx as an error, even if the body parsed (the route
      // returns JSON for 503 / 500 too).
      if (!res.ok && !data.error) data.error = `http_${res.status}`;
      setBriefing(data);
    } catch {
      setBriefing({ briefing: "Jarvis is offline.", error: "network" });
    }
    setLoadingBrief(false);
  }

  // Status drives both the header badge and the collapsed-card badge so they
  // never disagree with the body text.
  type Status = "loading" | "online" | "setup" | "offline";
  const status: Status = loadingBrief
    ? "loading"
    : briefing?.error === "not_configured"
      ? "setup"
      : briefing?.error
        ? "offline"
        : briefing
          ? "online"
          : "loading";

  const statusBadge = {
    loading: { label: "…", className: "text-white/50 bg-white/5 border-white/10" },
    online: { label: "Online", className: "text-[#99ff33] bg-[#99ff33]/10 border-[#99ff33]/30" },
    setup: { label: "Setup", className: "text-[#99ff33] bg-[#99ff33]/10 border-[#99ff33]/30" },
    offline: { label: "Offline", className: "text-red-300 bg-red-500/10 border-red-500/30" },
  }[status];

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount; not migrating to Suspense
  useEffect(() => { fetchBriefing(); }, []);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, thinking]);

  async function send() {
    const msg = input.trim();
    if (!msg || thinking) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    setThinking(true);

    try {
      const res = await fetch("/api/ai/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", content: `⚠️ ${err.error || "Request failed"}` };
          return next;
        });
        setThinking(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let text = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          setMessages((m) => {
            const next = [...m];
            next[next.length - 1] = { role: "assistant", content: text };
            return next;
          });
        }
      }
    } catch {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: "assistant", content: "⚠️ Network error" };
        return next;
      });
    }
    setThinking(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const s = briefing?.stats;

  // If AI is not configured AND the user dismissed the banner, hide the whole widget
  if (briefing?.error === "not_configured" && notConfiguredDismissed) {
    return null;
  }

  // Collapsed state — thin status bar with one click to expand
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full rounded-xl surface-dark-accent shadow-md flex items-center gap-3 px-4 py-2.5 hover:shadow-lg transition-shadow group cursor-pointer"
        aria-label="Expand Jarvis"
        aria-expanded="false"
      >
        <div className="h-7 w-7 rounded-lg bg-[#99ff33] flex items-center justify-center shadow-[0_0_16px_rgb(153_255_51/0.4)] shrink-0">
          <Sparkles size={13} className="text-[#0d1a00]" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <span className="text-sm font-bold text-white">Jarvis</span>
          <span className={cn(
            "text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border ml-2",
            statusBadge.className,
          )}>
            {statusBadge.label}
          </span>
          {s && (
            <span className="text-[11px] text-white/50 ml-2">
              {s.overdue > 0 && <span className="text-red-300">{s.overdue} overdue · </span>}
              {s.today} today · {s.urgent} urgent
            </span>
          )}
        </div>
        <ChevronDown size={14} className="text-white/60 group-hover:text-white shrink-0 transition-transform duration-200" />
      </button>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden surface-dark-accent shadow-[0_8px_40px_rgb(0_0_0/0.25)] animate-fade-in">
      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-white/[0.08] flex items-center gap-3">
        <div className="relative">
          <div className="h-9 w-9 rounded-xl bg-[#99ff33] flex items-center justify-center shadow-[0_0_24px_rgb(153_255_51/0.5)]">
            <Sparkles size={16} className="text-[#0d1a00]" strokeWidth={2.5} />
          </div>
          <span className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0a0e0a]",
            status === "online" && "bg-[#99ff33] animate-pulse",
            status === "setup" && "bg-amber-400",
            status === "offline" && "bg-red-500",
            status === "loading" && "bg-white/30",
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            Jarvis
            <span className={cn(
              "text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border",
              statusBadge.className,
            )}>
              {statusBadge.label}
            </span>
          </h2>
          <p className="text-[11px] text-white/40">Personal AI workspace assistant</p>
        </div>
        <button
          type="button"
          onClick={fetchBriefing}
          disabled={loadingBrief}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-white transition-colors disabled:opacity-40"
          title="Refresh briefing"
        >
          <RefreshCw size={13} className={loadingBrief ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-white transition-colors cursor-pointer"
          title="Collapse"
          aria-label="Collapse Jarvis"
          aria-expanded="true"
        >
          <ChevronUp size={13} className="transition-transform duration-200" />
        </button>
      </div>

      {/* ── Stats row ── */}
      {s && (
        <div className="grid grid-cols-4 gap-0 border-b border-white/[0.08]">
          <StatTile icon={AlertTriangle} label="Overdue" value={s.overdue} accent={s.overdue > 0 ? "text-red-400" : "text-white/40"} />
          <StatTile icon={Clock} label="Today" value={s.today} accent="text-amber-300" />
          <StatTile icon={Flame} label="Urgent" value={s.urgent} accent={s.urgent > 0 ? "text-orange-400" : "text-white/40"} />
          <StatTile icon={FolderOpen} label="Projects" value={s.projects} accent="text-[#99ff33]" />
        </div>
      )}

      {/* ── Briefing ── */}
      <div className="px-5 py-4 border-b border-white/[0.08] min-h-[60px]">
        {loadingBrief ? (
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <Loader2 size={13} className="animate-spin" />
            Analyzing your workspace…
          </div>
        ) : briefing?.error === "not_configured" ? (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200 relative">
            <button
              type="button"
              onClick={dismissNotConfigured}
              className="absolute top-1.5 right-1.5 h-6 w-6 flex items-center justify-center rounded-md hover:bg-white/10 text-amber-200/70 hover:text-amber-100 transition-colors cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss not-configured banner"
            >
              <X size={12} />
            </button>
            <p className="font-semibold mb-1 pr-7">⚡ AI not configured</p>
            <p className="text-amber-200/80 pr-7">
              Add <code className="font-mono bg-black/40 px-1 rounded text-[10px]">ANTHROPIC_API_KEY</code> or{" "}
              <code className="font-mono bg-black/40 px-1 rounded text-[10px]">OPENAI_API_KEY</code> to{" "}
              <code className="font-mono bg-black/40 px-1 rounded text-[10px]">.env.local</code> to unlock Jarvis.
            </p>
          </div>
        ) : (
          <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">
            {briefing?.briefing}
          </p>
        )}
      </div>

      {/* ── Chat messages ── */}
      {messages.length > 0 && (
        <div ref={chatContainerRef} className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto border-b border-white/[0.08]">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2.5",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {m.role === "assistant" && (
                <div className="h-6 w-6 rounded-lg bg-[#99ff33]/15 border border-[#99ff33]/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles size={10} className="text-[#99ff33]" />
                </div>
              )}
              <div
                className={cn(
                  "text-xs leading-relaxed whitespace-pre-wrap rounded-xl px-3 py-2 max-w-[85%]",
                  m.role === "user"
                    ? "bg-[#99ff33] text-[#0d1a00] font-medium"
                    : "bg-white/[0.06] text-white/90 border border-white/[0.06]"
                )}
              >
                {m.content || (thinking && i === messages.length - 1 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#99ff33] animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#99ff33] animate-pulse [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#99ff33] animate-pulse [animation-delay:300ms]" />
                  </span>
                ) : null)}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {/* ── Suggestion chips (shown when no messages) ── */}
      {messages.length === 0 && !loadingBrief && briefing?.error !== "not_configured" && (
        <div className="px-5 py-3 border-b border-white/[0.08] flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Try:</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setInput(s)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white border border-white/[0.06] transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div className="p-3 bg-black/20">
        <div className="relative flex items-end gap-2 rounded-xl bg-white/[0.05] border border-white/[0.08] focus-within:border-[#99ff33]/50 focus-within:ring-2 focus-within:ring-[#99ff33]/20 transition-all">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Jarvis anything about your workspace…"
            disabled={thinking || briefing?.error === "not_configured"}
            rows={1}
            className="flex-1 min-h-[38px] max-h-32 px-3 py-2 bg-transparent border-0 text-sm text-white placeholder:text-white/30 focus-visible:ring-0 resize-none scrollbar-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={thinking || !input.trim() || briefing?.error === "not_configured"}
            className="mb-1.5 mr-1.5 h-7 w-7 flex items-center justify-center rounded-lg bg-[#99ff33] text-[#0d1a00] hover:bg-[#7acc29] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {thinking ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="px-4 py-3 border-r border-white/[0.06] last:border-0">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon size={11} className={accent} />
        <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">{label}</span>
      </div>
      <p className={cn("text-xl font-bold leading-none", accent)}>{value}</p>
    </div>
  );
}
