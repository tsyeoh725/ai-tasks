"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Dependency = {
  id: string;
  type: string;
  dependencyTask?: { id: string; title: string; status: string };
  dependentTask?: { id: string; title: string; status: string };
};

export function TaskDependencies({ taskId }: { taskId: string }) {
  const [blockedBy, setBlockedBy] = useState<Dependency[]>([]);
  const [blocking, setBlocking] = useState<Dependency[]>([]);
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    fetchDeps();
  }, [taskId]);

  async function fetchDeps() {
    try {
      const res = await fetch(`/api/tasks/${taskId}/dependencies`);
      if (!res.ok) return;
      const data = await res.json();
      setBlockedBy(data.blockedBy || []);
      setBlocking(data.blocking || []);
    } catch {
      // Silently ignore network errors (e.g. during hot reload)
    }
  }

  async function searchTasks(q: string) {
    if (q.length < 2) { setSearchResults([]); return; }
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=task`);
    const data = await res.json();
    setSearchResults(
      (data.results || [])
        .filter((r: any) => r.id !== taskId)
        .map((r: any) => ({ id: r.id, title: r.title }))
    );
  }

  async function addDependency(depTaskId: string) {
    await fetch(`/api/tasks/${taskId}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependencyTaskId: depTaskId, type: "blocked_by" }),
    });
    setAdding(false);
    setSearchQuery("");
    setSearchResults([]);
    fetchDeps();
  }

  async function removeDependency(depId: string) {
    await fetch(`/api/tasks/${taskId}/dependencies`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependencyId: depId }),
    });
    fetchDeps();
  }

  const statusColors: Record<string, string> = {
    todo: "bg-gray-400",
    in_progress: "bg-blue-400",
    done: "bg-green-400",
    blocked: "bg-red-400",
  };

  return (
    <div className="space-y-3">
      {/* Blocked By */}
      {blockedBy.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase mb-1.5">Blocked By</p>
          <div className="space-y-1">
            {blockedBy.map((dep) => (
              <div key={dep.id} className="flex items-center gap-2 text-sm group">
                <span className={cn("h-2 w-2 rounded-full", statusColors[dep.dependencyTask?.status || ""] || "bg-gray-400")} />
                <a href={`/tasks/${dep.dependencyTask?.id}`} className="flex-1 hover:underline truncate">
                  {dep.dependencyTask?.title}
                </a>
                {dep.dependencyTask?.status === "done" && (
                  <span className="text-xs text-green-500">Done</span>
                )}
                <button
                  onClick={() => removeDependency(dep.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  type="button"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blocking */}
      {blocking.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase mb-1.5">Blocking</p>
          <div className="space-y-1">
            {blocking.map((dep) => (
              <div key={dep.id} className="flex items-center gap-2 text-sm">
                <span className={cn("h-2 w-2 rounded-full", statusColors[dep.dependentTask?.status || ""] || "bg-gray-400")} />
                <a href={`/tasks/${dep.dependentTask?.id}`} className="flex-1 hover:underline truncate">
                  {dep.dependentTask?.title}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add dependency */}
      {adding ? (
        <div className="space-y-2">
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchTasks(e.target.value);
            }}
            placeholder="Search for a task..."
            className="text-sm"
            autoFocus
          />
          {searchResults.length > 0 && (
            <div className="border rounded-md max-h-32 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => addDependency(r.id)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors truncate"
                  type="button"
                >
                  {r.title}
                </button>
              ))}
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setSearchQuery(""); setSearchResults([]); }}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)} className="text-xs">
          <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add dependency
        </Button>
      )}
    </div>
  );
}
