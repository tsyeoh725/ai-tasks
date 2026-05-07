"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { format, subDays, parseISO, startOfDay, isAfter } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Task = {
  id: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt?: string | null;
  assignee?: { name: string } | null;
  createdAt?: string;
};

type Props = {
  tasks: Task[];
  projectName?: string;
};

const STATUS_COLORS: Record<string, string> = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  done: "#22c55e",
  blocked: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#94a3b8",
  medium: "#3b82f6",
  high: "#f97316",
  urgent: "#ef4444",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function DashboardCharts({ tasks, projectName }: Props) {
  // Defer chart render until after mount to avoid recharts width=-1 warnings
  // when the parent has not yet been measured (dev/strict mode).
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    // Wait for the parent to be measured so recharts doesn't see width=-1
    const id = requestAnimationFrame(() => setChartReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "done").length;
    const overdue = tasks.filter((t) => {
      if (t.status === "done" || !t.dueDate) return false;
      return isAfter(now, parseISO(t.dueDate));
    }).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, overdue, completionRate };
  }, [tasks]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      color: STATUS_COLORS[status] || "#94a3b8",
    }));
  }, [tasks]);

  const priorityData = useMemo(() => {
    const order = ["low", "medium", "high", "urgent"];
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      counts[t.priority] = (counts[t.priority] || 0) + 1;
    }
    return order
      .filter((p) => counts[p])
      .map((priority) => ({
        name: PRIORITY_LABELS[priority] || priority,
        count: counts[priority],
        fill: PRIORITY_COLORS[priority] || "#94a3b8",
      }));
  }, [tasks]);

  const completionTrend = useMemo(() => {
    const now = new Date();
    const days: { date: string; count: number }[] = [];
    const countsByDay: Record<string, number> = {};

    for (const t of tasks) {
      if (!t.completedAt) continue;
      const day = format(startOfDay(parseISO(t.completedAt)), "yyyy-MM-dd");
      countsByDay[day] = (countsByDay[day] || 0) + 1;
    }

    for (let i = 29; i >= 0; i--) {
      const date = format(subDays(now, i), "yyyy-MM-dd");
      days.push({
        date: format(subDays(now, i), "MMM d"),
        count: countsByDay[date] || 0,
      });
    }
    return days;
  }, [tasks]);

  const assigneeData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      const name = t.assignee?.name || "Unassigned";
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [tasks]);

  return (
    <div className="space-y-6">
      {projectName && (
        <h2 className="text-xl font-semibold">{projectName} Dashboard</h2>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card size="sm">
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Total Tasks</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold text-green-500">
              {stats.completed}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Overdue</p>
            <p className="text-2xl font-bold text-red-500">{stats.overdue}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Completion Rate</p>
            <p className="text-2xl font-bold">{stats.completionRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Tasks by Status - Donut Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No tasks yet
              </p>
            ) : (
              <div className="h-64">
                {chartReady && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  {/* F-08: donut now has a Legend, slice tooltip with raw
                      counts, and the center text gets a "tasks" caption so
                      a stripped-down screenshot is still readable. */}
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="45%"
                      innerRadius={55}
                      outerRadius={85}
                      dataKey="value"
                      nameKey="name"
                      paddingAngle={2}
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => {
                        const n = typeof value === "number" ? value : Number(value) || 0;
                        const pct = stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;
                        return [`${n} (${pct}%)`, name];
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={28}
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <text
                      x="50%"
                      y="45%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-foreground text-2xl font-bold"
                    >
                      {stats.total}
                    </text>
                    <text
                      x="50%"
                      y="45%"
                      dy={22}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {stats.total === 1 ? "task" : "tasks"}
                    </text>
                  </PieChart>
                </ResponsiveContainer>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks by Priority - Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks by Priority</CardTitle>
          </CardHeader>
          <CardContent>
            {priorityData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No tasks yet
              </p>
            ) : (
              <div className="h-64">
                {chartReady && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={priorityData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {priorityData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completion Trend - Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Completion Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {chartReady && (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={completionTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    fontSize={12}
                    interval="preserveStartEnd"
                    tickCount={6}
                  />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    name="Completed"
                  />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tasks by Assignee - Horizontal Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks by Assignee</CardTitle>
          </CardHeader>
          <CardContent>
            {assigneeData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No tasks yet
              </p>
            ) : (
              <div className="h-64">
                {chartReady && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={assigneeData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" allowDecimals={false} fontSize={12} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      fontSize={12}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      fill="#3b82f6"
                      radius={[0, 4, 4, 0]}
                      name="Tasks"
                    />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
