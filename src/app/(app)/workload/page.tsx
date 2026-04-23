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
    setLoading(true);
    const url = selectedTeamId ? `/api/workload?teamId=${selectedTeamId}` : "/api/workload";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setMembers(data.members || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedTeamId]);

  function capacityColor(total: number) {
    if (total <= 5) return "bg-green-500";
    if (total <= 10) return "bg-yellow-500";
    return "bg-red-500";
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

                {/* Stacked bar */}
                {barTotal > 0 && (
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

                {/* Capacity bar */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Capacity</div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${capacityColor(member.totalTasks)}`}
                      style={{ width: `${Math.min(member.totalTasks * 6.67, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
