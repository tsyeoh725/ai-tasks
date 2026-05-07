"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow, parseISO, isAfter } from "date-fns";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JarvisOverview } from "@/components/jarvis-overview";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string | null;
  projectId: string;
  projectName: string;
  projectColor: string;
  clientId: string | null;
  clientName: string | null;
  assignee: { name: string } | null;
};

type ProjectSummary = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  totalTasks: number;
  completedTasks: number;
};

type TimeBlock = {
  id: string;
  title: string;
  category: string;
  startTime: string;
  endTime: string;
  taskId: string | null;
  isLocked: boolean;
};

type ActivityEntry = {
  id: string;
  action: string;
  field: string | null;
  newValue: string | null;
  oldValue: string | null;
  createdAt: string;
  userName: string;
  entityId: string;
  entityTitle: string;
};

type DashboardData = {
  overdue: Task[];
  dueToday: Task[];
  upcoming: Task[];
  completed: Task[];
  summary: string | null;
  projects: ProjectSummary[];
  allTasks: Task[];
  todayBlocks: TimeBlock[];
  recentActivity: ActivityEntry[];
  stats: {
    completedThisWeek: number;
    totalOverdue: number;
    totalTasks: number;
  };
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

const CATEGORY_COLORS: Record<string, string> = {
  deep_work: "#3b82f6",
  creative: "#8b5cf6",
  admin: "#f59e0b",
  meeting: "#ef4444",
  break: "#6b7280",
  review: "#10b981",
  quick_tasks: "#f97316",
};

const CATEGORY_LABELS: Record<string, string> = {
  deep_work: "Deep Work",
  creative: "Creative",
  admin: "Admin",
  meeting: "Meeting",
  break: "Break",
  review: "Review",
  quick_tasks: "Quick Tasks",
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "overdue" | "completed">("upcoming");
  // Recharts measures the parent before layout in dev/strict mode, producing
  // width=-1/height=-1 warnings. Defer chart render until after mount.
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    // Wait for the parent to be measured so recharts doesn't see width=-1
    const id = requestAnimationFrame(() => setChartReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  // F-51: while session is still loading, don't show a stale "there"
  // placeholder. We render a name-shaped skeleton in the header.
  const firstName = session?.user?.name?.split(" ")[0];
  const sessionReady = Boolean(session?.user?.name);
  const dateStr = format(now, "EEEE, MMMM d");

  const upcomingTasks = [...(data?.dueToday || []), ...(data?.upcoming || [])];
  const tabTasks =
    activeTab === "upcoming"
      ? upcomingTasks
      : activeTab === "overdue"
      ? data?.overdue || []
      : data?.completed || [];

  // Chart computations
  const statusData = useMemo(() => {
    const tasks = data?.allTasks;
    if (!tasks) return [];
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      color: STATUS_COLORS[status] || "#94a3b8",
    }));
  }, [data?.allTasks]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, completed: 0, overdue: 0, completionRate: 0, inProgress: 0, active: 0 };
    const total = data.stats.totalTasks;
    const completed = data.allTasks.filter((t) => t.status === "done").length;
    const inProgress = data.allTasks.filter((t) => t.status === "in_progress").length;
    // "active" = anything not done (todo, in_progress, blocked) — what users expect from "X active"
    const active = data.allTasks.filter((t) => t.status !== "done").length;
    const overdue = data.allTasks.filter((t) => {
      if (t.status === "done" || !t.dueDate) return false;
      return isAfter(new Date(), parseISO(t.dueDate));
    }).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, overdue, completionRate, inProgress, active };
  }, [data]);

  // Client deadlines — next deliverable per client in the next 14 days (or overdue)
  const clientDeadlines = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 86_400_000);
    type Deadline = {
      clientId: string | null;
      clientName: string;
      taskId: string;
      projectId: string;
      taskTitle: string;
      dueDate: Date;
      daysRemaining: number;
    };
    const candidates: Deadline[] = data.allTasks
      .filter((t) => t.status !== "done" && t.dueDate && t.clientName)
      .map((t) => {
        const due = parseISO(t.dueDate!);
        const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
        return {
          clientId: t.clientId,
          clientName: t.clientName!,
          taskId: t.id,
          projectId: t.projectId,
          taskTitle: t.title,
          dueDate: due,
          daysRemaining: days,
        };
      })
      .filter((d) => d.dueDate <= horizon || d.daysRemaining < 0);

    // Group by client → take the soonest task per client
    const byClient = new Map<string, Deadline>();
    for (const d of candidates) {
      const existing = byClient.get(d.clientName);
      if (!existing || d.dueDate < existing.dueDate) byClient.set(d.clientName, d);
    }

    // Sort by urgency (most urgent first)
    return Array.from(byClient.values()).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [data]);

  async function toggleTaskStatus(task: Task) {
    const newStatus = task.status === "done" ? "todo" : "done";
    setData((prev) => {
      if (!prev) return prev;
      const update = (list: Task[]) =>
        list.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t));
      return {
        ...prev,
        overdue: update(prev.overdue),
        dueToday: update(prev.dueToday),
        upcoming: update(prev.upcoming),
        completed: update(prev.completed),
        allTasks: update(prev.allTasks),
      };
    });
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      fetch("/api/dashboard")
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 animate-fade-in">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{dateStr}</p>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <span>{greeting},</span>
              {sessionReady ? (
                <span>{firstName}</span>
              ) : (
                // F-51: skeleton instead of "there" placeholder while
                // next-auth resolves the session.
                <span
                  aria-hidden
                  className="inline-block h-7 w-24 rounded bg-muted animate-pulse"
                />
              )}
            </h1>
            {data && (
              <p className="text-sm text-muted-foreground mt-1">
                {stats.inProgress > 0
                  ? `You have ${stats.inProgress} task${stats.inProgress !== 1 ? "s" : ""} in progress`
                  : stats.total > 0
                  ? "Ready to tackle your day"
                  : "Welcome — create your first project to get started"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/schedule")}>
              <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Schedule
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/ai")}>
              <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Ask AI
            </Button>
          </div>
        </div>

        {/* ── Jarvis AI overview ── */}
        <div className="mb-6">
          <JarvisOverview />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} size="sm">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
                  <div className="h-7 bg-muted rounded animate-pulse w-2/3 mt-3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Client Deadlines Row — agency-first metric, replaces generic stat cards */}
            <ClientDeadlinesRow deadlines={clientDeadlines} router={router} />

            {/* Main Grid: Tasks (left, wider) + Today's Schedule (right) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* My Tasks widget — 2 cols */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">My tasks</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => router.push("/tasks")} className="text-xs">
                      View all →
                    </Button>
                  </div>
                  {/* Tabs */}
                  <div className="flex gap-1 mt-3">
                    {([
                      { key: "upcoming" as const, label: "Upcoming", count: upcomingTasks.length },
                      { key: "overdue" as const, label: "Overdue", count: data?.overdue?.length || 0 },
                      { key: "completed" as const, label: "Completed", count: data?.completed?.length || 0 },
                    ]).map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                          "text-sm font-medium px-3 py-1.5 rounded-md transition-colors",
                          activeTab === tab.key
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        )}
                        type="button"
                      >
                        {tab.label}
                        {tab.count > 0 && (
                          <span
                            className={cn(
                              "ml-1.5 text-xs rounded-full px-1.5 py-0.5",
                              tab.key === "overdue" && tab.count > 0
                                ? "bg-red-500/20 text-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
                                : "bg-muted"
                            )}
                          >
                            {tab.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {tabTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {activeTab === "upcoming"
                        ? "No upcoming tasks. You're all caught up!"
                        : activeTab === "overdue"
                        ? "No overdue tasks. Great job!"
                        : "No completed tasks this week."}
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-[400px] overflow-y-auto">
                      {tabTasks.map((task) => (
                        <div
                          key={task.id}
                          onClick={() => router.push(`/tasks/${task.id}`)}
                          onKeyDown={(e) => e.key === "Enter" && router.push(`/tasks/${task.id}`)}
                          role="link"
                          tabIndex={0}
                          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors duration-150 group cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={task.status === "done"}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleTaskStatus(task);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded flex-shrink-0 cursor-pointer"
                          />
                          <span
                            className={cn(
                              "flex-1 text-sm truncate",
                              task.status === "done" && "line-through text-muted-foreground"
                            )}
                          >
                            {task.title}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-xs opacity-70 group-hover:opacity-100 gap-1 hidden sm:inline-flex"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: task.projectColor }}
                            />
                            {task.projectName}
                          </Badge>
                          {task.dueDate && (
                            <span
                              className={cn(
                                "text-xs whitespace-nowrap",
                                new Date(task.dueDate) < new Date() && task.status !== "done"
                                  ? "text-red-500"
                                  : "text-muted-foreground"
                              )}
                            >
                              {format(new Date(task.dueDate), "MMM d")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Today's Schedule */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Today&apos;s schedule</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => router.push("/schedule")} className="text-xs">
                      Full →
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!data?.todayBlocks || data.todayBlocks.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No time blocks today</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs"
                        onClick={() => router.push("/schedule")}
                      >
                        Plan your day
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {data.todayBlocks.map((block) => {
                        const start = format(new Date(block.startTime), "HH:mm");
                        const end = format(new Date(block.endTime), "HH:mm");
                        const color = CATEGORY_COLORS[block.category] || "#6b7280";
                        return (
                          <div
                            key={block.id}
                            onClick={() => block.taskId && router.push(`/tasks/${block.taskId}`)}
                            className={cn(
                              "flex items-start gap-2 p-2 rounded-md border-l-2 bg-muted/40 hover:bg-muted transition-colors",
                              block.taskId && "cursor-pointer"
                            )}
                            style={{ borderLeftColor: color }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{block.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {start}–{end} · {CATEGORY_LABELS[block.category] || block.category}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Tasks by Status — single chart, no longer in a 3-col grid */}
            <div className="grid grid-cols-1 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tasks by status</CardTitle>
                </CardHeader>
                <CardContent>
                  {statusData.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No tasks yet</p>
                  ) : !chartReady ? (
                    // F-40: keep min-height even before chart mounts so the
                    // recharts ResponsiveContainer doesn't see width=-1 on
                    // first paint.
                    <div className="h-64" />
                  ) : (
                    // F-08, F-40: bigger container + legend below chart so the
                    // donut isn't decoration. Each segment now shows its name
                    // and count next to a coloured swatch.
                    <div className="h-64 min-h-64">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <PieChart>
                          <Pie
                            data={statusData}
                            cx="50%"
                            cy="45%"
                            innerRadius={45}
                            outerRadius={70}
                            dataKey="value"
                            paddingAngle={2}
                          >
                            {statusData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value, name) => {
                              const n = typeof value === "number" ? value : Number(value) || 0;
                              const total = statusData.reduce((acc, s) => acc + s.value, 0);
                              const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                              return [`${n} (${pct}%)`, name];
                            }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                            wrapperStyle={{ fontSize: 12 }}
                            formatter={(value, entry) => {
                              // entry.payload has the data point. Recharts
                              // typings don't expose .value on legend payload,
                              // so look up the count by name.
                              const point = statusData.find((s) => s.name === value);
                              const count = point ? point.value : 0;
                              return (
                                <span className="text-foreground">
                                  {value} <span className="text-muted-foreground">({count})</span>
                                </span>
                              );
                            }}
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
                            textAnchor="middle"
                            dominantBaseline="middle"
                            dy={20}
                            className="fill-muted-foreground text-[10px] uppercase tracking-wider"
                          >
                            total
                          </text>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>

            {/* Projects + Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Projects — 2 cols */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Projects</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push("/projects/new")}
                      className="text-xs gap-1"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!data?.projects || data.projects.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No projects yet</p>
                      <Button
                        size="sm"
                        className="mt-3"
                        onClick={() => router.push("/projects/new")}
                      >
                        Create Project
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {data.projects.map((project) => {
                        const pct = project.totalTasks > 0
                          ? Math.round((project.completedTasks / project.totalTasks) * 100)
                          : 0;
                        return (
                          <div
                            key={project.id}
                            onClick={() => router.push(`/projects/${project.id}`)}
                            className="rounded-lg border bg-card hover:bg-accent transition-all duration-300 hover:scale-[1.02] hover:shadow-md p-3 group cursor-pointer"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {project.icon ? (
                                <span
                                  className="h-8 w-8 rounded-lg flex items-center justify-center text-base"
                                  style={{ backgroundColor: project.color + "20" }}
                                >
                                  {project.icon}
                                </span>
                              ) : (
                                <span
                                  className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                                  style={{ backgroundColor: project.color }}
                                >
                                  {project.name[0]?.toUpperCase()}
                                </span>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate group-hover:text-foreground">
                                  {project.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {project.totalTasks} tasks · {project.completedTasks} done
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                                {pct}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {!data?.recentActivity || data.recentActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No recent activity
                    </p>
                  ) : (
                    // F-64: group entries by day so the list isn't a flat
                    // wall of "about 8 hours ago" — each entry's day header
                    // gives temporal context.
                    <div className="space-y-4 max-h-[400px] overflow-y-auto">
                      {(() => {
                        const groups: { label: string; entries: ActivityEntry[] }[] = [];
                        const today = new Date();
                        const todayKey = format(today, "yyyy-MM-dd");
                        const yesterdayKey = format(
                          new Date(today.getTime() - 86_400_000),
                          "yyyy-MM-dd",
                        );
                        for (const a of data.recentActivity) {
                          const d = new Date(a.createdAt);
                          const key = format(d, "yyyy-MM-dd");
                          const label =
                            key === todayKey
                              ? "Today"
                              : key === yesterdayKey
                              ? "Yesterday"
                              : format(d, "EEE, MMM d");
                          let group = groups.find((g) => g.label === label);
                          if (!group) {
                            group = { label, entries: [] };
                            groups.push(group);
                          }
                          group.entries.push(a);
                        }
                        return groups.map((g) => (
                          <div key={g.label}>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                              {g.label}
                            </div>
                            <div className="space-y-1.5">
                              {g.entries.map((a) => (
                                <div
                                  key={a.id}
                                  onClick={() => router.push(`/tasks/${a.entityId}`)}
                                  className="flex items-start gap-2.5 cursor-pointer hover:bg-accent/50 rounded-md p-1.5 -mx-1.5 transition-colors"
                                >
                                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium flex-shrink-0 mt-0.5">
                                    {a.userName[0]?.toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs">
                                      <span className="font-medium">{a.userName}</span>
                                      <span className="text-muted-foreground"> {actionPhrase(a)} </span>
                                      <span className="font-medium">{a.entityTitle}</span>
                                    </p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function actionPhrase(a: ActivityEntry): string {
  switch (a.action) {
    case "created":
      return "created";
    case "completed":
      return "completed";
    case "commented":
      return "commented on";
    case "assigned":
      return "was assigned to";
    case "moved":
      return "moved";
    case "deleted":
      return "deleted";
    case "updated":
      return a.field === "status"
        ? "changed status of"
        : a.field === "priority"
        ? "changed priority of"
        : "updated";
    default:
      return "updated";
  }
}

// ─── Client Deadlines Row ────────────────────────────────────────────────────

type ClientDeadline = {
  clientId: string | null;
  clientName: string;
  taskId: string;
  projectId: string;
  taskTitle: string;
  dueDate: Date;
  daysRemaining: number;
};

function ClientDeadlinesRow({
  deadlines,
  router,
}: {
  deadlines: ClientDeadline[];
  router: ReturnType<typeof useRouter>;
}) {
  if (deadlines.length === 0) {
    return (
      <div className="mb-6">
        {/* F-18: prefixed "Client deadlines:" so the banner can't be read as
            "all of your tasks are clear" — there can still be plenty of tasks
            below in the My Tasks panel. */}
        <Card className="border-l-4 border-l-green-500 bg-green-50/40 dark:bg-green-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center shrink-0">
              <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">Client deadlines: all clear</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No client-deliverable deadlines in the next 14 days. (Personal/internal tasks are listed below.)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 font-bold">Client Deadlines</h2>
        <span className="text-[11px] text-gray-400">{deadlines.length} client{deadlines.length !== 1 ? "s" : ""} · next 14 days</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
        {deadlines.map((d) => {
          // Color coding by urgency
          const urgency =
            d.daysRemaining < 0 ? "overdue"
            : d.daysRemaining === 0 ? "today"
            : d.daysRemaining <= 1 ? "today"
            : d.daysRemaining <= 4 ? "soon"
            : "ok";
          const accent = {
            overdue: "border-l-red-500 bg-red-50/30 dark:bg-red-500/5",
            today: "border-l-red-500 bg-red-50/30 dark:bg-red-500/5",
            soon: "border-l-amber-500 bg-amber-50/30 dark:bg-amber-500/5",
            ok: "border-l-green-500 bg-green-50/30 dark:bg-green-500/5",
          }[urgency];
          const dueLabel =
            d.daysRemaining < 0 ? `${Math.abs(d.daysRemaining)}d overdue`
            : d.daysRemaining === 0 ? "Today"
            : d.daysRemaining === 1 ? "Tomorrow"
            : `${d.daysRemaining}d left`;
          const dueColor = {
            overdue: "text-red-600",
            today: "text-red-600",
            soon: "text-amber-700",
            ok: "text-green-700",
          }[urgency];

          return (
            <button
              key={d.taskId}
              type="button"
              onClick={() => router.push(`/projects/${d.projectId}`)}
              className={cn(
                "snap-start shrink-0 w-64 text-left rounded-xl border border-gray-200 dark:border-white/10 border-l-4 px-4 py-3 hover:shadow-md transition-all bg-white dark:bg-white/[0.03]",
                accent,
              )}
            >
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold truncate mb-0.5">
                {d.clientName}
              </p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight mb-2">
                {d.taskTitle}
              </p>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500">
                  {format(d.dueDate, "MMM d")}
                </span>
                <span className={cn("font-bold tabular-nums", dueColor)}>
                  {dueLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
