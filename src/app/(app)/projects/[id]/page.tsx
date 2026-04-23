"use client";

import { useEffect, useState, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { KanbanBoard } from "@/components/kanban-board";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { RichTextEditor } from "@/components/rich-text-editor";
import { DocumentList } from "@/components/document-list";
import { CalendarView } from "@/components/calendar-view";
import { TimelineView } from "@/components/timeline-view";
import { DashboardCharts } from "@/components/dashboard-charts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ProjectCustomFieldSettings } from "@/components/custom-fields";
import { AutomationBuilder } from "@/components/automation-builder";
import { ProjectMessages } from "@/components/project-messages";
import { ProjectOverview } from "@/components/project-overview";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
  startDate?: string | null;
  isMilestone?: boolean;
  completedAt?: string | null;
  createdAt: string;
  assigneeId?: string | null;
  assignee?: { name: string } | null;
  subtasks?: { isDone: boolean }[];
  sectionId?: string | null;
};

type Member = {
  userId: string;
  name: string;
  email: string;
};

type ProjectOption = {
  id: string;
  name: string;
  color: string;
};

type FilterState = {
  status: Set<string>;
  priority: Set<string>;
  assignee: Set<string>;
  hasDueDate: boolean;
  overdueOnly: boolean;
};

type ColumnKey = "title" | "assignee" | "dueDate" | "priority" | "status" | "project";

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  title: true,
  assignee: true,
  dueDate: true,
  priority: true,
  status: true,
  project: true,
};

const COLUMN_LABELS: Record<ColumnKey, string> = {
  title: "Task",
  assignee: "Assignee",
  dueDate: "Due",
  priority: "Priority",
  status: "Status",
  project: "Project",
};

function emptyFilters(): FilterState {
  return {
    status: new Set(),
    priority: new Set(),
    assignee: new Set(),
    hasDueDate: false,
    overdueOnly: false,
  };
}

function countFilters(f: FilterState): number {
  return (
    f.status.size +
    f.priority.size +
    f.assignee.size +
    (f.hasDueDate ? 1 : 0) +
    (f.overdueOnly ? 1 : 0)
  );
}

type Section = {
  id: string;
  name: string;
  sortOrder: number;
};

type Project = {
  id: string;
  name: string;
  color: string;
  description: string | null;
  teamId: string | null;
};

type ActiveTab = "overview" | "board" | "list" | "calendar" | "timeline" | "dashboard" | "messages" | "brief" | "documents" | "fields" | "automations";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [sortBy, setSortBy] = useState<string>("default");
  const [groupBy, setGroupBy] = useState<string>("none");
  const [loading, setLoading] = useState(true);
  const [briefContent, setBriefContent] = useState("{}");
  const [briefLoaded, setBriefLoaded] = useState(false);
  const [briefStatus, setBriefStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [prioritizing, setPrioritizing] = useState(false);
  const toast = useToast();

  // List toolbar state
  const [filters, setFilters] = useState<FilterState>(() => emptyFilters());
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(DEFAULT_COLUMNS);
  const [density, setDensity] = useState<"compact" | "comfortable">("comfortable");
  const [members, setMembers] = useState<Member[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([]);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchData = useCallback(async () => {
    const [projRes, tasksRes, sectionsRes] = await Promise.all([
      fetch(`/api/projects/${id}`),
      fetch(`/api/tasks?projectId=${id}`),
      fetch(`/api/projects/${id}/sections`),
    ]);

    if (projRes.ok) setProject(await projRes.json());
    if (tasksRes.ok) {
      const data = await tasksRes.json();
      setTasks(data.tasks || []);
    }
    if (sectionsRes.ok) {
      const data = await sectionsRes.json();
      setSections(data.sections || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load brief when tab is selected
  useEffect(() => {
    if (activeTab === "brief" && !briefLoaded) {
      fetch(`/api/briefs?projectId=${id}`)
        .then((r) => r.json())
        .then((data) => {
          setBriefContent(data.content || "{}");
          setBriefLoaded(true);
        })
        .catch(() => setBriefLoaded(true));
    }
  }, [activeTab, briefLoaded, id]);

  // Hydrate per-project visible columns + density from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`listCols:${id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, boolean>>;
        setVisibleColumns({ ...DEFAULT_COLUMNS, ...parsed });
      }
      const d = window.localStorage.getItem(`listDensity:${id}`);
      if (d === "compact" || d === "comfortable") setDensity(d);
    } catch {
      // ignore
    }
  }, [id]);

  // Persist visible columns
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`listCols:${id}`, JSON.stringify(visibleColumns));
    } catch {
      // ignore
    }
  }, [visibleColumns, id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`listDensity:${id}`, density);
    } catch {
      // ignore
    }
  }, [density, id]);

  // Load project members (for assignee filter + quick assignee change)
  useEffect(() => {
    if (!project?.teamId) {
      setMembers([]);
      return;
    }
    fetch(`/api/teams/${project.teamId}`)
      .then((r) => r.json())
      .then((data) => {
        const ms = (data.members || []).map(
          (m: { userId: string; user?: { name: string; email: string } }) => ({
            userId: m.userId,
            name: m.user?.name || "Unknown",
            email: m.user?.email || "",
          })
        );
        setMembers(ms);
      })
      .catch(() => {});
  }, [project?.teamId]);

  // Load all projects for bulk project mover
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setAllProjects(data.projects || []))
      .catch(() => {});
  }, []);

  async function handleTaskMove(taskId: string, newStatus: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function handleTaskSectionMove(taskId: string, newSectionId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, sectionId: newSectionId } : t)));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: newSectionId }),
    });
  }

  async function handleBriefChange(content: string) {
    setBriefContent(content);
    setBriefStatus("saving");
    try {
      const res = await fetch("/api/briefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, content: JSON.parse(content) }),
      });
      setBriefStatus(res.ok ? "saved" : "error");
    } catch {
      setBriefStatus("error");
    }
  }

  async function handleAiPrioritize() {
    if (prioritizing) return;
    setPrioritizing(true);
    try {
      const res = await fetch("/api/ai/prioritize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error({
          title: "Couldn't prioritize tasks",
          description: data?.error || "Try again in a moment.",
        });
        return;
      }
      if (data?.message) {
        toast.info(data.message);
        return;
      }
      const count = Array.isArray(data?.rankings) ? data.rankings.length : 0;
      const unschedulable = data?.scheduleContext?.unschedulableTasks ?? 0;
      toast.success({
        title: `Ranked ${count} task${count === 1 ? "" : "s"}`,
        description:
          unschedulable > 0
            ? `${unschedulable} may not fit before their deadline.`
            : undefined,
      });
      fetchData();
    } catch {
      toast.error("Couldn't prioritize tasks");
    } finally {
      setPrioritizing(false);
    }
  }

  async function patchTask(taskId: string, body: Record<string, unknown>) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Apply filters to tasks
  const filteredTasks = useMemo(() => {
    const now = Date.now();
    return tasks.filter((t) => {
      if (filters.status.size > 0 && !filters.status.has(t.status)) return false;
      if (filters.priority.size > 0 && !filters.priority.has(t.priority)) return false;
      if (filters.assignee.size > 0) {
        const aid = t.assigneeId || "";
        if (!filters.assignee.has(aid)) return false;
      }
      if (filters.hasDueDate && !t.dueDate) return false;
      if (filters.overdueOnly) {
        if (!t.dueDate) return false;
        if (t.status === "done") return false;
        if (new Date(t.dueDate).getTime() >= now) return false;
      }
      return true;
    });
  }, [tasks, filters]);

  const activeFilterCount = countFilters(filters);

  function toggleFilterMember(key: "status" | "priority" | "assignee", value: string) {
    setFilters((prev) => {
      const next = new Set(prev[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [key]: next };
    });
  }

  function resetFilters() {
    setFilters(emptyFilters());
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function csvEscape(val: string): string {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function exportCsv() {
    // Full canonical export format. Columns match the import schema so an
    // exported file round-trips through import-csv.
    const headers = [
      "Title",
      "Status",
      "Priority",
      "Assignee",
      "Assignee Email",
      "Due Date",
      "Labels",
      "Description",
    ];

    const rows = filteredTasks.map((t) => {
      const email = members.find((m) => m.userId === t.assigneeId)?.email || "";
      const due = t.dueDate
        ? new Date(t.dueDate).toISOString().slice(0, 10)
        : "";
      return [
        t.title,
        t.status,
        t.priority,
        t.assignee?.name || "",
        email,
        due,
        "", // Labels: not loaded in the list view yet; column kept for round-trip.
        "", // Description: not loaded in the list view; kept for round-trip.
      ]
        .map(csvEscape)
        .join(",");
    });

    const csv = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name || "tasks"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Bulk selection helpers
  function toggleSelect(taskId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleSelectAllVisible(visibleIds: string[]) {
    setSelectedIds((prev) => {
      const allIn = visibleIds.every((tid) => prev.has(tid));
      const next = new Set(prev);
      if (allIn) {
        visibleIds.forEach((tid) => next.delete(tid));
      } else {
        visibleIds.forEach((tid) => next.add(tid));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkPatch(body: Record<string, unknown>) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map((tid) =>
          fetch(`/api/tasks/${tid}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        )
      );
      await fetchData();
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map((tid) => fetch(`/api/tasks/${tid}`, { method: "DELETE" }))
      );
      await fetchData();
      clearSelection();
      setConfirmDelete(false);
    } finally {
      setBulkBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "board", label: "Board" },
    { id: "list", label: "List" },
    { id: "calendar", label: "Calendar" },
    { id: "timeline", label: "Timeline" },
    { id: "dashboard", label: "Dashboard" },
    { id: "messages", label: "Messages" },
    { id: "brief", label: "Brief" },
    { id: "documents", label: "Documents" },
    { id: "fields", label: "Fields" },
    { id: "automations", label: "Automations" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-3 p-4 border-b md:flex-row md:items-center md:justify-between md:gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
          <h1 className="text-xl font-bold truncate">{project.name}</h1>
          <span className="text-sm text-muted-foreground shrink-0">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {/* Tab buttons — scroll horizontally on mobile */}
          <div className="flex bg-muted rounded-lg p-0.5 overflow-x-auto scrollbar-none max-w-full snap-x snap-mandatory">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 snap-start whitespace-nowrap px-3 py-1 text-sm rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {(activeTab === "board" || activeTab === "list" || activeTab === "calendar" || activeTab === "timeline") && (
            <>
              <Button variant="outline" size="sm" onClick={handleAiPrioritize} disabled={prioritizing} className="shrink-0">
                <svg className={cn("h-4 w-4 mr-1", prioritizing && "animate-pulse")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="hidden sm:inline">{prioritizing ? "Prioritizing…" : "AI Prioritize"}</span>
                <span className="sm:hidden">{prioritizing ? "…" : "AI"}</span>
              </Button>
              <div className="shrink-0">
                <CreateTaskDialog projectId={project.id} onCreated={fetchData} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "overview" && <ProjectOverview project={project} />}

        {activeTab === "messages" && <ProjectMessages projectId={project.id} />}

        {activeTab === "board" && (
          <KanbanBoard
            tasks={tasks}
            projectId={project.id}
            onTaskMove={handleTaskMove}
            onRefresh={fetchData}
            sections={sections}
            onTaskSectionMove={handleTaskSectionMove}
          />
        )}

        {activeTab === "list" && (() => {
          const rowPadding = density === "compact" ? "py-1" : "py-2";
          const visibleColCount =
            (visibleColumns.title ? 1 : 0) +
            (visibleColumns.assignee ? 1 : 0) +
            (visibleColumns.dueDate ? 1 : 0) +
            (visibleColumns.priority ? 1 : 0) +
            (visibleColumns.status ? 1 : 0) +
            (visibleColumns.project ? 1 : 0) +
            2; // select + done

          return (
          <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b text-sm">
              <span className="text-muted-foreground text-xs mr-1">Sort:</span>
              <Select value={sortBy} onValueChange={(v) => v && setSortBy(v)}>
                <SelectTrigger className="h-7 text-xs w-auto min-w-[100px] border-0 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="dueDate">Due Date</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs ml-2 mr-1">Group:</span>
              <Select value={groupBy} onValueChange={(v) => v && setGroupBy(v)}>
                <SelectTrigger className="h-7 text-xs w-auto min-w-[100px] border-0 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  {sections.length > 0 && <SelectItem value="section">Section</SelectItem>}
                </SelectContent>
              </Select>

              {/* Right-aligned controls */}
              <div className="ml-auto flex items-center gap-1">
                {/* Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={(props) => (
                      <Button {...props} variant="outline" size="sm" className="h-7 text-xs">
                        Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                      </Button>
                    )}
                  />
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>Status</DropdownMenuLabel>
                    {(["todo", "in_progress", "done", "blocked"] as const).map((s) => (
                      <DropdownMenuCheckboxItem
                        key={s}
                        checked={filters.status.has(s)}
                        closeOnClick={false}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleFilterMember("status", s);
                        }}
                      >
                        {statusLabels[s]}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Priority</DropdownMenuLabel>
                    {(["low", "medium", "high", "urgent"] as const).map((p) => (
                      <DropdownMenuCheckboxItem
                        key={p}
                        checked={filters.priority.has(p)}
                        closeOnClick={false}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleFilterMember("priority", p);
                        }}
                      >
                        <span className="capitalize">{p}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                    {members.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Assignee</DropdownMenuLabel>
                        <DropdownMenuCheckboxItem
                          checked={filters.assignee.has("")}
                          closeOnClick={false}
                          onClick={(e) => {
                            e.preventDefault();
                            toggleFilterMember("assignee", "");
                          }}
                        >
                          Unassigned
                        </DropdownMenuCheckboxItem>
                        {members.map((m) => (
                          <DropdownMenuCheckboxItem
                            key={m.userId}
                            checked={filters.assignee.has(m.userId)}
                            closeOnClick={false}
                            onClick={(e) => {
                              e.preventDefault();
                              toggleFilterMember("assignee", m.userId);
                            }}
                          >
                            {m.name}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={filters.hasDueDate}
                      closeOnClick={false}
                      onClick={(e) => {
                        e.preventDefault();
                        setFilters((p) => ({ ...p, hasDueDate: !p.hasDueDate }));
                      }}
                    >
                      Has due date
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={filters.overdueOnly}
                      closeOnClick={false}
                      onClick={(e) => {
                        e.preventDefault();
                        setFilters((p) => ({ ...p, overdueOnly: !p.overdueOnly }));
                      }}
                    >
                      Overdue only
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        resetFilters();
                      }}
                    >
                      Reset filters
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Fields */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={(props) => (
                      <Button {...props} variant="outline" size="sm" className="h-7 text-xs">
                        Fields
                      </Button>
                    )}
                  />
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                    {(Object.keys(DEFAULT_COLUMNS) as ColumnKey[]).map((k) => (
                      <DropdownMenuCheckboxItem
                        key={k}
                        checked={visibleColumns[k]}
                        closeOnClick={false}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleColumn(k);
                        }}
                      >
                        {COLUMN_LABELS[k]}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Options */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={(props) => (
                      <Button {...props} variant="outline" size="sm" className="h-7 text-xs">
                        Options
                      </Button>
                    )}
                  />
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => exportCsv()}>Export as CSV</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push(`/projects/${id}/import`)}>
                      Import CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => fetchData()}>Refresh</DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        setDensity((d) => (d === "compact" ? "comfortable" : "compact"))
                      }
                    >
                      Toggle density ({density === "compact" ? "compact" : "comfortable"})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {filteredTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">
                  {tasks.length === 0
                    ? "No tasks yet. Create one to get started!"
                    : "No tasks match the current filters."}
                </p>
              ) : (
                <table className="w-full min-w-[720px] md:min-w-0 text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b text-xs text-muted-foreground uppercase">
                      <th className="w-10 px-4 py-2 text-left">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded"
                          checked={
                            filteredTasks.length > 0 &&
                            filteredTasks.every((t) => selectedIds.has(t.id))
                          }
                          onChange={() =>
                            toggleSelectAllVisible(filteredTasks.map((t) => t.id))
                          }
                        />
                      </th>
                      <th className="w-10 px-4 py-2 text-left"></th>
                      {visibleColumns.title && <th className="px-4 py-2 text-left font-medium">Name</th>}
                      {visibleColumns.assignee && <th className="w-32 px-4 py-2 text-left font-medium">Assignee</th>}
                      {visibleColumns.dueDate && <th className="w-28 px-4 py-2 text-left font-medium">Due date</th>}
                      {visibleColumns.priority && <th className="w-60 px-4 py-2 text-left font-medium">Priority</th>}
                      {visibleColumns.status && <th className="w-28 px-4 py-2 text-left font-medium">Status</th>}
                      {visibleColumns.project && <th className="w-28 px-4 py-2 text-left font-medium">Project</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const sorted = [...filteredTasks];
                      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
                      const statusOrder: Record<string, number> = { todo: 0, in_progress: 1, blocked: 2, done: 3 };
                      if (sortBy === "name") sorted.sort((a, b) => a.title.localeCompare(b.title));
                      else if (sortBy === "priority") sorted.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
                      else if (sortBy === "dueDate") sorted.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
                      else if (sortBy === "status") sorted.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

                      // If sections exist and no explicit grouping chosen, default to grouping by section.
                      const effectiveGroupBy = groupBy === "none" && sections.length > 0 ? "section" : groupBy;

                      const rowProps: RowCommon = {
                        onToggle: handleTaskMove,
                        onPatch: async (taskId, body) => {
                          await patchTask(taskId, body);
                          fetchData();
                        },
                        members,
                        projectName: project.name,
                        visibleColumns,
                        rowPadding,
                        selectedIds,
                        onSelect: toggleSelect,
                      };

                      if (effectiveGroupBy === "none") {
                        return sorted.map((task) => (
                          <TaskRow key={task.id} task={task} {...rowProps} />
                        ));
                      }

                      if (effectiveGroupBy === "section") {
                        const sectionName = (sid: string | null | undefined) =>
                          sid ? (sections.find((s) => s.id === sid)?.name || "No section") : "No section";

                        const orderedSectionIds = [...sections.map((s) => s.id), null as string | null];
                        const groups = new Map<string | null, typeof sorted>();
                        for (const sid of orderedSectionIds) groups.set(sid, []);
                        for (const t of sorted) {
                          const key = t.sectionId && sections.some((s) => s.id === t.sectionId) ? t.sectionId : null;
                          if (!groups.has(key)) groups.set(key, []);
                          groups.get(key)!.push(t);
                        }

                        return Array.from(groups.entries())
                          .filter(([, groupTasks]) => groupTasks.length > 0)
                          .map(([sid, groupTasks]) => (
                            <GroupSection
                              key={sid ?? "__none__"}
                              label={sectionName(sid)}
                              tasks={groupTasks}
                              colSpan={visibleColCount}
                              {...rowProps}
                            />
                          ));
                      }

                      const groups: Record<string, typeof sorted> = {};
                      for (const t of sorted) {
                        const key = effectiveGroupBy === "status" ? t.status : t.priority;
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(t);
                      }

                      return Object.entries(groups).map(([group, groupTasks]) => (
                        <GroupSection
                          key={group}
                          label={group}
                          tasks={groupTasks}
                          colSpan={visibleColCount}
                          {...rowProps}
                        />
                      ));
                    })()}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          );
        })()}

        {activeTab === "calendar" && (
          <div className="p-4">
            <CalendarView
              tasks={tasks}
              onTaskClick={(taskId) => router.push(`/tasks/${taskId}`)}
              onDateChange={async (taskId, newDate) => {
                await fetch(`/api/tasks/${taskId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ dueDate: newDate }),
                });
                fetchData();
              }}
            />
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="p-4 h-full">
            <TimelineView
              tasks={tasks}
              onTaskClick={(taskId) => router.push(`/tasks/${taskId}`)}
            />
          </div>
        )}

        {activeTab === "dashboard" && (
          <div className="p-6">
            <DashboardCharts tasks={tasks} projectName={project.name} />
          </div>
        )}

        {activeTab === "brief" && (
          <div className="p-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Project Brief</h2>
              <span
                className={cn(
                  "text-xs transition-colors",
                  briefStatus === "error" ? "text-red-400" : "text-muted-foreground"
                )}
              >
                {briefStatus === "saving" && "Saving…"}
                {briefStatus === "saved" && "Saved"}
                {briefStatus === "error" && "Save failed — check connection"}
              </span>
            </div>
            <RichTextEditor
              content={briefContent}
              onChange={handleBriefChange}
              placeholder="Write your project brief, specs, notes..."
            />
          </div>
        )}

        {activeTab === "documents" && (
          <div className="p-6 max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold mb-4">Documents</h2>
            <DocumentList projectId={project.id} />
          </div>
        )}

        {activeTab === "fields" && (
          <div className="p-6 max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold mb-4">Custom Fields</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Define custom fields that appear on all tasks in this project.
            </p>
            <ProjectCustomFieldSettings projectId={project.id} />
          </div>
        )}

        {activeTab === "automations" && (
          <div className="p-6 max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold mb-4">Automations</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Create rules to automate task workflows. When a trigger fires, actions run automatically.
            </p>
            <AutomationBuilder projectId={project.id} />
          </div>
        )}
      </div>

      {/* Bulk multi-select bar */}
      {activeTab === "list" && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background rounded-full shadow-lg px-4 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-background/30" />
          {/* Assignee */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(props) => (
                <button
                  {...props}
                  disabled={bulkBusy}
                  className="text-xs rounded-full px-2 py-1 hover:bg-background/10 disabled:opacity-50"
                >
                  Assignee
                </button>
              )}
            />
            <DropdownMenuContent align="center" side="top" className="w-48">
              <DropdownMenuItem onClick={() => bulkPatch({ assigneeId: null })}>
                Unassign
              </DropdownMenuItem>
              {members.length > 0 && <DropdownMenuSeparator />}
              {members.map((m) => (
                <DropdownMenuItem
                  key={m.userId}
                  onClick={() => bulkPatch({ assigneeId: m.userId })}
                >
                  {m.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Priority */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(props) => (
                <button
                  {...props}
                  disabled={bulkBusy}
                  className="text-xs rounded-full px-2 py-1 hover:bg-background/10 disabled:opacity-50"
                >
                  Priority
                </button>
              )}
            />
            <DropdownMenuContent align="center" side="top" className="w-32">
              {(["low", "medium", "high", "urgent"] as const).map((p) => (
                <DropdownMenuItem key={p} onClick={() => bulkPatch({ priority: p })}>
                  <span className="capitalize">{p}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Status */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(props) => (
                <button
                  {...props}
                  disabled={bulkBusy}
                  className="text-xs rounded-full px-2 py-1 hover:bg-background/10 disabled:opacity-50"
                >
                  Status
                </button>
              )}
            />
            <DropdownMenuContent align="center" side="top" className="w-36">
              {(["todo", "in_progress", "done", "blocked"] as const).map((s) => (
                <DropdownMenuItem key={s} onClick={() => bulkPatch({ status: s })}>
                  {statusLabels[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Move (section/project) */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(props) => (
                <button
                  {...props}
                  disabled={bulkBusy}
                  className="text-xs rounded-full px-2 py-1 hover:bg-background/10 disabled:opacity-50"
                >
                  Move
                </button>
              )}
            />
            <DropdownMenuContent align="center" side="top" className="w-56">
              {sections.length > 0 && (
                <>
                  <DropdownMenuLabel>Section in this project</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => bulkPatch({ sectionId: null })}>
                    No section
                  </DropdownMenuItem>
                  {sections.map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => bulkPatch({ sectionId: s.id })}>
                      {s.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel>Move to project</DropdownMenuLabel>
              {allProjects
                .filter((p) => p.id !== project.id)
                .map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => bulkPatch({ projectId: p.id, sectionId: null })}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Delete */}
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={bulkBusy}
            className="text-xs rounded-full px-2 py-1 hover:bg-background/10 disabled:opacity-50 text-red-300"
          >
            Delete
          </button>
          <div className="h-4 w-px bg-background/30" />
          {/* Clear */}
          <button
            onClick={clearSelection}
            disabled={bulkBusy}
            className="rounded-full px-2 py-1 hover:bg-background/10 disabled:opacity-50"
            aria-label="Clear selection"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-lg border shadow-lg p-6 w-96 space-y-4">
            <div>
              <h3 className="text-lg font-semibold">
                Delete {selectedIds.size} task{selectedIds.size === 1 ? "" : "s"}?
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={bulkBusy}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={bulkDelete} disabled={bulkBusy}>
                {bulkBusy ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type TaskRowTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeId?: string | null;
  assignee?: { name: string } | null;
};

const priorityColors: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-400",
};

const statusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

type RowCommon = {
  onToggle: (id: string, status: string) => void;
  onPatch: (id: string, body: Record<string, unknown>) => void | Promise<void>;
  members: Member[];
  projectName: string;
  visibleColumns: Record<ColumnKey, boolean>;
  rowPadding: string;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
};

function TaskRow({
  task,
  onToggle,
  onPatch,
  members,
  projectName,
  visibleColumns,
  rowPadding,
  selectedIds,
  onSelect,
}: { task: TaskRowTask } & RowCommon) {
  const isDone = task.status === "done";
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isDone;
  const isSelected = selectedIds.has(task.id);

  return (
    <tr className={cn("border-b hover:bg-accent/50 transition-colors group", isSelected && "bg-accent/40")}>
      <td className={cn("px-4", rowPadding)}>
        <input
          type="checkbox"
          className="h-4 w-4 rounded"
          checked={isSelected}
          onChange={() => onSelect(task.id)}
        />
      </td>
      <td className={cn("px-4", rowPadding)}>
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => onToggle(task.id, isDone ? "todo" : "done")}
          className="h-4 w-4 rounded"
        />
      </td>
      {visibleColumns.title && (
        <td className={cn("px-4", rowPadding)}>
          <a href={`/tasks/${task.id}`} className={cn("hover:underline", isDone && "line-through text-muted-foreground")}>
            {task.title}
          </a>
        </td>
      )}
      {visibleColumns.assignee && (
        <td className={cn("px-4", rowPadding)}>
          {task.assignee ? (
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-medium flex-shrink-0">
                {task.assignee.name[0]?.toUpperCase()}
              </div>
              <span className="text-xs text-muted-foreground truncate">{task.assignee.name.split(" ")[0]}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}
      {visibleColumns.dueDate && (
        <td className={cn("px-4", rowPadding)}>
          {task.dueDate ? (
            <span className={cn("text-xs", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
              {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}
      {visibleColumns.priority && (
        <td className={cn("px-4", rowPadding)}>
          <div className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", priorityColors[task.priority] || "bg-gray-400")} />
            <span className="text-xs capitalize text-muted-foreground">{task.priority}</span>
            {/* Hover quick-actions */}
            <div className="ml-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <QuickAssigneePopover
                members={members}
                currentId={task.assigneeId || null}
                onPick={(uid) => onPatch(task.id, { assigneeId: uid })}
              />
              <QuickDueDatePopover
                value={task.dueDate}
                onPick={(d) => onPatch(task.id, { dueDate: d })}
              />
              <QuickPriorityMenu
                current={task.priority}
                onPick={(p) => onPatch(task.id, { priority: p })}
              />
            </div>
          </div>
        </td>
      )}
      {visibleColumns.status && (
        <td className={cn("px-4", rowPadding)}>
          <span className="text-xs text-muted-foreground">{statusLabels[task.status] || task.status}</span>
        </td>
      )}
      {visibleColumns.project && (
        <td className={cn("px-4", rowPadding)}>
          <span className="text-xs text-muted-foreground truncate">{projectName}</span>
        </td>
      )}
    </tr>
  );
}

function GroupSection({
  label,
  tasks,
  colSpan,
  ...rest
}: {
  label: string;
  tasks: TaskRowTask[];
  colSpan: number;
} & RowCommon) {
  const displayLabel = statusLabels[label] || label;

  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={colSpan} className="px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase">{displayLabel}</span>
            <span className="text-xs text-muted-foreground">{tasks.length}</span>
          </div>
        </td>
      </tr>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} {...rest} />
      ))}
    </>
  );
}

function QuickAssigneePopover({
  members,
  currentId,
  onPick,
}: {
  members: Member[];
  currentId: string | null;
  onPick: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <button
            {...props}
            className="h-5 w-5 rounded-full bg-muted hover:bg-accent flex items-center justify-center"
            aria-label="Change assignee"
          >
            <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        )}
      />
      <PopoverContent className="w-56 p-2">
        <Input
          className="h-7 text-xs"
          placeholder="Search members..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-48 overflow-auto mt-2 space-y-0.5">
          <button
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
            className={cn(
              "w-full text-left text-xs px-2 py-1 rounded hover:bg-accent",
              !currentId && "font-medium"
            )}
          >
            Unassigned
          </button>
          {filtered.map((m) => (
            <button
              key={m.userId}
              onClick={() => {
                onPick(m.userId);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left text-xs px-2 py-1 rounded hover:bg-accent",
                currentId === m.userId && "font-medium"
              )}
            >
              {m.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">No matches</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QuickDueDatePopover({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (d: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(
    value ? new Date(value).toISOString().slice(0, 10) : ""
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <button
            {...props}
            className="h-5 w-5 rounded-full bg-muted hover:bg-accent flex items-center justify-center"
            aria-label="Change due date"
          >
            <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        )}
      />
      <PopoverContent className="w-56 p-2">
        <Input
          type="date"
          className="h-8 text-xs"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
        />
        <div className="flex justify-between mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              setLocal("");
              onPick(null);
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              onPick(local || null);
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QuickPriorityMenu({
  current,
  onPick,
}: {
  current: string;
  onPick: (p: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(props) => (
          <button
            {...props}
            className="h-5 w-5 rounded-full bg-muted hover:bg-accent flex items-center justify-center"
            aria-label="Change priority"
          >
            <span className={cn("h-2 w-2 rounded-full", priorityColors[current] || "bg-gray-400")} />
          </button>
        )}
      />
      <DropdownMenuContent align="end" className="w-32">
        {(["low", "medium", "high", "urgent"] as const).map((p) => (
          <DropdownMenuItem key={p} onClick={() => onPick(p)}>
            <span className={cn("mr-2 h-2 w-2 rounded-full", priorityColors[p])} />
            <span className="capitalize">{p}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
