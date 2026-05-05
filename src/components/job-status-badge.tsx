"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

type Job = {
  id: string;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed";
  label: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusDot(status: Job["status"]) {
  switch (status) {
    case "queued":
      return "bg-slate-400";
    case "running":
      return "bg-blue-500 animate-pulse";
    case "succeeded":
      return "bg-emerald-500";
    case "failed":
      return "bg-red-500";
  }
}

export function JobStatusBadge() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs/active");
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: Job[] };
      setJobs(data.jobs || []);
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount + interval poll
    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  // Hide entirely when nothing to show.
  if (jobs.length === 0) return null;

  async function handleDismiss() {
    try {
      await fetch("/api/jobs/active", { method: "DELETE" });
    } catch {}
    fetchJobs();
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors",
          active > 0
            ? "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300"
            : failed > 0
              ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300",
        )}
        title="Background jobs"
      >
        <span className={cn("h-2 w-2 rounded-full", statusDot(active > 0 ? "running" : failed > 0 ? "failed" : "succeeded"))} />
        <span className="hidden sm:inline">
          {active > 0
            ? `${active} running`
            : failed > 0
              ? `${failed} failed`
              : "Done"}
        </span>
        <span className="sm:hidden">{active || failed || jobs.length}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d130d] shadow-lg z-50">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Background jobs</span>
            {jobs.some((j) => j.status === "succeeded" || j.status === "failed") && (
              <button
                type="button"
                onClick={handleDismiss}
                className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
              >
                Clear done
              </button>
            )}
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {jobs.map((job) => (
              <li key={job.id} className="px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", statusDot(job.status))} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 dark:text-slate-100 truncate">
                      {job.label || job.type}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {job.status}
                      {" · "}
                      {job.status === "succeeded" || job.status === "failed"
                        ? `finished ${timeAgo(job.finishedAt || job.createdAt)}`
                        : `started ${timeAgo(job.startedAt || job.createdAt)}`}
                    </div>
                    {job.error && (
                      <div className="text-[11px] text-red-600 dark:text-red-400 mt-1 break-words">
                        {job.error}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
