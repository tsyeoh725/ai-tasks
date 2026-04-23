"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type LogLevel = "info" | "warn" | "error" | "debug";

type LogEntry = {
  level: LogLevel;
  source: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
};

type Session = {
  id: string;
  created_at: string;
  entity_id: string;
  payload: { logs: LogEntry[] };
};

const levelBadge: Record<LogLevel, "destructive" | "warning" | "default" | "secondary"> = {
  error: "destructive",
  warn: "warning",
  info: "default",
  debug: "secondary",
};

export default function LogsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LogLevel | "all">("all");
  const [sessionFilter, setSessionFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(
    new Set(),
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (levelFilter !== "all") params.set("level", levelFilter);
      if (sessionFilter) params.set("sessionId", sessionFilter);
      const res = await fetch(`/api/marketing/logs?${params.toString()}`);
      const data = await res.json();
      const list: Session[] = Array.isArray(data) ? data : data.sessions || [];
      setSessions(list);
      if (list.length > 0) setExpanded(new Set([list[0].id]));
    } catch {
      // noop
    }
    setLoading(false);
  }, [levelFilter, sessionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function toggleSession(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDetails(key: string) {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            System Logs
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Full communication trace — Meta API, AI Guard, actions, errors
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchLogs} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 flex flex-wrap gap-3 items-end">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
              Level
            </div>
            <Select
              value={levelFilter}
              onValueChange={(v) => v && setLevelFilter(v as LogLevel | "all")}
            >
              <SelectTrigger className="h-8 w-32">
                <SelectValue>{levelFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warn</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[220px] max-w-md">
            <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
              Session ID
            </div>
            <Input
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              placeholder="Filter by session ID..."
              className="h-8 font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-white/40" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-white/60">No logs yet</p>
            <p className="text-xs text-white/40 mt-1">
              Run an AI audit to generate logs
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const logs = session.payload?.logs || [];
            const errorCount = logs.filter((l) => l.level === "error").length;
            const warnCount = logs.filter((l) => l.level === "warn").length;
            const isExpanded = expanded.has(session.id);

            return (
              <Card key={session.id}>
                <button
                  onClick={() => toggleSession(session.id)}
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-white/40 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-white/40 shrink-0" />
                  )}
                  <span className="text-xs font-mono text-white">
                    {session.entity_id}
                  </span>
                  <span className="text-[11px] text-white/40 font-mono">
                    {new Date(session.created_at).toLocaleString()}
                  </span>
                  <span className="text-[11px] text-white/40 ml-auto font-mono">
                    {logs.length} entries
                  </span>
                  {warnCount > 0 && (
                    <Badge variant="warning">{warnCount} warn</Badge>
                  )}
                  {errorCount > 0 && (
                    <Badge variant="destructive">{errorCount} err</Badge>
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                    {logs.map((entry, i) => {
                      const detailKey = `${session.id}-${i}`;
                      const hasDetails =
                        entry.details &&
                        Object.keys(entry.details).length > 0;
                      return (
                        <div
                          key={i}
                          className="px-4 py-1.5 hover:bg-white/[0.03]"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <Badge
                              variant={levelBadge[entry.level] || "secondary"}
                              className="font-mono uppercase shrink-0"
                            >
                              {entry.level}
                            </Badge>
                            <span className="text-[11px] text-white/60 shrink-0 w-28 truncate font-mono">
                              {entry.source}
                            </span>
                            <span className="text-xs text-white/90 flex-1 min-w-0 truncate">
                              {entry.message}
                            </span>
                            <span className="text-[10px] text-white/30 font-mono shrink-0">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                            {hasDetails && (
                              <button
                                onClick={() => toggleDetails(detailKey)}
                                className="text-white/40 hover:text-white/80 shrink-0"
                              >
                                {expandedDetails.has(detailKey) ? (
                                  <ChevronDown className="w-3 h-3" />
                                ) : (
                                  <ChevronRight className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>
                          {hasDetails && expandedDetails.has(detailKey) && (
                            <pre
                              className={cn(
                                "mt-1 text-[11px] font-mono text-white/70 bg-black/30 border border-white/[0.06] rounded-lg p-2 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap break-all",
                              )}
                            >
                              {JSON.stringify(entry.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                    {logs.length === 0 && (
                      <div className="px-4 py-3 text-xs text-white/40 text-center">
                        No log entries
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
