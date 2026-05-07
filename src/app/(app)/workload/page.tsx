"use client";

import { useState, useEffect } from "react";

type Team = {
  id: string;
  name: string;
};

type MemberWorkload = {
  id: string;
  name: string;
  email: string;
  totalTasks: number;
  todoTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalEstimatedHours: number;
  tasksByPriority: { low: number; medium: number; high: number; urgent: number };
};

export default function WorkloadPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [members, setMembers] = useState<MemberWorkload[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data) => {
        const t = data.teams || [];
        setTeams(t);
        // Default to "personal" (empty teamId) which shows the current user
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    setLoading(true);
    const url = selectedTeamId ? `/api/workload?teamId=${selectedTeamId}` : "/api/workload";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setMembers(data.members || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedTeamId]);

  // F-34: thresholds keyed off percentage of capacity, not absolute task
  // count. Previously a healthy 5 tasks (~33% fill) showed red because the
  // bar's color check ignored the bar's own width. The capacity ceiling is
  // 15 tasks → 100%, so:
  //   <70%  (≤10 tasks) → green   "comfortable"
  //   70–95% (11–14)    → amber   "near capacity"
  //   ≥100% (15+)       → red     "over capacity"
  const CAPACITY_CEILING = 15;
  function capacityPercent(total: number): number {
    return (total / CAPACITY_CEILING) * 100;
  }
  function capacityColor(pct: number): string {
    if (pct >= 100) return "bg-red-500";
    if (pct >= 70) return "bg-amber-500";
    return "bg-green-500";
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Workload</h1>
          <p className="text-sm text-muted-foreground">
            {selectedTeamId ? "Team capacity" : "Your personal workload"}
          </p>
        </div>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
        >
          <option value="">Personal (just me)</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="text-center py-16 text-muted-foreground">Loading...</div>
      )}

      {!loading && members.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          {selectedTeamId ? "No members found in this team" : "No workload data"}
        </div>
      )}

      {members.length > 0 && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((member) => {
            const barTotal = member.todoTasks + member.inProgressTasks + member.completedTasks;
            const todoPct = barTotal > 0 ? (member.todoTasks / barTotal) * 100 : 0;
            const inProgressPct = barTotal > 0 ? (member.inProgressTasks / barTotal) * 100 : 0;
            const donePct = barTotal > 0 ? (member.completedTasks / barTotal) * 100 : 0;

            return (
              <div
                key={member.id}
                className="border rounded-lg p-4 bg-card space-y-3"
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                    {member.name[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{member.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {member.totalTasks} tasks
                    </div>
                  </div>
                </div>

                {/* F-34: stacked status bar with an inline legend, so the
                    gray/blue/green segments are self-explanatory instead of
                    requiring a tooltip hover to decode. */}
                {barTotal > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                      <div
                        className="bg-gray-400"
                        style={{ width: `${todoPct}%` }}
                        title={`Todo: ${member.todoTasks}`}
                      />
                      <div
                        className="bg-blue-500"
                        style={{ width: `${inProgressPct}%` }}
                        title={`In Progress: ${member.inProgressTasks}`}
                      />
                      <div
                        className="bg-green-500"
                        style={{ width: `${donePct}%` }}
                        title={`Done: ${member.completedTasks}`}
                      />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> {member.todoTasks} todo
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> {member.inProgressTasks} in progress
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> {member.completedTasks} done
                      </span>
                    </div>
                  </div>
                )}

                {/* Stats row */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {member.totalEstimatedHours > 0 && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      {member.totalEstimatedHours}h est.
                    </span>
                  )}
                  {member.overdueTasks > 0 && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900 dark:text-red-300">
                      {member.overdueTasks} overdue
                    </span>
                  )}
                </div>

                {/* F-34: Capacity bar — percentage-based color, with the
                    fill value and active-task count rendered inline so the
                    bar communicates load even at a glance. */}
                <div>
                  {(() => {
                    const pct = capacityPercent(member.totalTasks);
                    const fillPct = Math.min(pct, 100);
                    return (
                      <>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Capacity</span>
                          <span className="tabular-nums">
                            {member.totalTasks}/{CAPACITY_CEILING} ({Math.round(pct)}%)
                          </span>
                        </div>
                        <div className="relative h-4 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${capacityColor(pct)}`}
                            style={{ width: `${fillPct}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-foreground/80 mix-blend-luminosity">
                            {member.totalTasks} active
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
