"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow, subDays, parseISO, startOfDay, isAfter } from "date-fns";
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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string | null;
  projectName: string;
  projectColor: string;
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
  const firstName = session?.user?.name?.split(" ")[0] || "there";
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
    if (!data?.allTasks) return [];
    const counts: Record<string, number> = {};
    for (const t of data.allTasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      color: STATUS_COLORS[status] || "#94a3b8",
    }));
  }, [data?.allTasks]);

  const priorityData = useMemo(() => {
    if (!data?.allTasks) return [];
    const order = ["low", "medium", "high", "urgent"];
    const counts: Record<string, number> = {};
    for (const t of data.allTasks) {
      counts[t.priority] = (counts[t.priority] || 0) + 1;
    }
    return order
      .filter((p) => counts[p])
      .map((priority) => ({
        name: PRIORITY_LABELS[priority] || priority,
        count: counts[priority],
        fill: PRIORITY_COLORS[priority] || "#94a3b8",
      }));
  }, [data?.allTasks]);

  const completionTrend = useMemo(() => {
    if (!data?.allTasks) return [];
    const days: { date: string; count: number }[] = [];
    const countsByDay: Record<string, number> = {};

    for (const t of data.allTasks) {
      if (!t.completedAt) continue;
      const day = format(startOfDay(parseISO(t.completedAt)), "yyyy-MM-dd");
      countsByDay[day] = (countsByDay[day] || 0) + 1;
    }

    for (let i = 13; i >= 0; i--) {
      const date = format(subDays(now, i), "yyyy-MM-dd");
      days.push({
        date: format(subDays(now, i), "MMM d"),
        count: countsByDay[date] || 0,
      });
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.allTasks]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, completed: 0, overdue: 0, completionRate: 0, inProgress: 0 };
    const total = data.stats.totalTasks;
    const completed = data.allTasks.filter((t) => t.status === "done").length;
    const inProgress = data.allTasks.filter((t) => t.status === "in_progress").length;
    const overdue = data.allTasks.filter((t) => {
      if (t.status === "done" || !t.dueDate) return false;
      return isAfter(new Date(), parseISO(t.dueDate));
    }).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, overdue, completionRate, inProgress };
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
            <h1 className="text-3xl font-bold">
              {greeting}, {firstName}
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
            {/* Summary Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card size="sm" className="hover:shadow-md transition-shadow">
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Tasks</p>
                  <p className="text-3xl font-bold mt-1">{stats.total}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data?.projects.length || 0} project{data?.projects.length !== 1 ? "s" : ""}
                  </p>
                </CardContent>
              </Card>
              <Card size="sm" className="hover:shadow-md transition-shadow">
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Completed</p>
                  <p className="text-3xl font-bold mt-1 text-green-500">{stats.completed}</p>
                  <p className="text-xs text-muted-foreground mt-1">{data?.stats.completedThisWeek} this week</p>
                </CardContent>
              </Card>
              <Card
                size="sm"
                className={cn("hover:shadow-md transition-shadow", stats.overdue > 0 && "border-red-500/30")}
              >
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Overdue</p>
                  <p className={cn("text-3xl font-bold mt-1", stats.overdue > 0 ? "text-red-500" : "text-muted-foreground")}>
                    {stats.overdue}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.overdue > 0 ? "needs attention" : "all clear"}
                  </p>
                </CardContent>
              </Card>
              <Card size="sm" className="hover:shadow-md transition-shadow">
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Completion Rate</p>
                  <p className="text-3xl font-bold mt-1">{stats.completionRate}%</p>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all"
                      style={{ width: `${stats.completionRate}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

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

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Tasks by Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tasks by status</CardTitle>
                </CardHeader>
                <CardContent>
                  {statusData.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No tasks yet</p>
                  ) : (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            dataKey="value"
                            paddingAngle={2}
                          >
                            {statusData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <text
                            x="50%"
                            y="50%"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-foreground text-2xl font-bold"
                          >
                            {stats.total}
                          </text>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tasks by Priority */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tasks by priority</CardTitle>
                </CardHeader>
                <CardContent>
                  {priorityData.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No tasks yet</p>
                  ) : (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={priorityData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis allowDecimals={false} fontSize={11} />
                          <Tooltip />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {priorityData.map((entry, index) => (
                              <Cell key={index} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Completion Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Completion trend (14d)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={completionTrend}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="date" fontSize={11} interval="preserveStartEnd" tickCount={4} />
                        <YAxis allowDecimals={false} fontSize={11} />
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
                  </div>
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
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {data.recentActivity.map((a) => (
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
