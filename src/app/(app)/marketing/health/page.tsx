"use client";

import { useState } from "react";
import {
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Database,
  Brain,
  Send,
  Globe,
  Bot,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ServiceStatus = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};

type Results = Record<string, ServiceStatus>;

const services: {
  key: string;
  label: string;
  description: string;
  icon: typeof Database;
}[] = [
  {
    key: "jarvis_openai",
    label: "Jarvis (OpenAI)",
    description: "Assistant, digest, scheduling",
    icon: Bot,
  },
  {
    key: "audit_anthropic",
    label: "Audit (Anthropic)",
    description: "AI Guard agent",
    icon: Brain,
  },
  {
    key: "meta",
    label: "Meta API",
    description: "Facebook & Instagram Ads",
    icon: Globe,
  },
  {
    key: "telegram",
    label: "Telegram",
    description: "Notifications & approvals",
    icon: Send,
  },
  {
    key: "database",
    label: "Database",
    description: "Primary data store",
    icon: Database,
  },
];

export default function HealthPage() {
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/health", { method: "POST" });
      const data = (await res.json()) as Results;
      setResults(data);
    } catch {
      setError("Health check failed");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          System Health
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Check every external API: Jarvis (OpenAI), Audit (Anthropic), Meta, Telegram, Database
        </p>
      </div>

      <Button onClick={runCheck} disabled={loading} variant="primary">
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            Checking...
          </>
        ) : (
          <>
            <RefreshCw />
            Run Health Check
          </>
        )}
      </Button>

      {error && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {services.map((svc) => {
          const status = results?.[svc.key];
          const Icon = svc.icon;
          return (
            <Card key={svc.key}>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div
                    className={
                      !status
                        ? "h-10 w-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center"
                        : status.ok
                          ? "h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center"
                          : "h-10 w-10 rounded-xl bg-red-500/10 border border-red-400/20 flex items-center justify-center"
                    }
                  >
                    <Icon
                      className={
                        !status
                          ? "w-5 h-5 text-gray-400"
                          : status.ok
                            ? "w-5 h-5 text-emerald-300"
                            : "w-5 h-5 text-red-300"
                      }
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{svc.label}</span>
                      {status && (
                        <span className="inline-flex items-center">
                          <span
                            className={
                              status.ok
                                ? "inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153/0.8)]"
                                : "inline-block h-2 w-2 rounded-full bg-red-400 shadow-[0_0_6px_rgb(248_113_113/0.8)]"
                            }
                          />
                        </span>
                      )}
                      {status && (
                        <Badge
                          variant={status.ok ? "success" : "destructive"}
                        >
                          {status.ok ? (
                            <>
                              <CheckCircle className="w-3 h-3" /> OK
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" /> FAIL
                            </>
                          )}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {svc.description}
                    </p>
                    {status && (
                      <p
                        className={
                          status.ok
                            ? "text-xs text-emerald-300/80 mt-1"
                            : "text-xs text-red-300/80 mt-1"
                        }
                      >
                        {status.message}
                        {typeof status.latencyMs === "number" && (
                          <span className="text-gray-400"> ({status.latencyMs}ms)</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {results && (
        <div className="pt-3 border-t border-gray-200">
          {Object.values(results).every((r) => r.ok) ? (
            <p className="text-sm text-emerald-300">
              All systems operational.
            </p>
          ) : (
            <p className="text-sm text-red-300">
              Some services are failing. Fix them before running a cycle.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
