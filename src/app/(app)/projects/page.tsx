"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  CheckCircle2,
  Clock,
  Building2,
  Megaphone,
  LayoutGrid,
  List,
  Table2,
  Tag,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ProjectColorDot } from "@/components/icon-color-picker";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Project = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  category: string | null;
  campaign: string | null;
  status?: string | null;
  teamId?: string | null;
  updatedAt: string;
  _taskCount?: number;
  _completedCount?: number;
};

type LayoutMode = "grid" | "list" | "table";
type GroupMode = "by-campaign" | "by-client" | "by-status" | "by-category" | "all";
type SortKey = "name" | "client" | "status" | "tasks" | "progress" | "updated";

const UNGROUPED_CAMPAIGN = "Other";
const UNCLAIMED_CLIENT = "No Client";

const GROUP_OPTIONS: { id: GroupMode; label: string }[] = [
  { id: "by-campaign", label: "By Campaign" },
  { id: "by-client", label: "By Client" },
  { id: "by-status", label: "By Status" },
  { id: "by-category", label: "By Category" },
  { id: "all", label: "All Projects" },
];

const STATUS_ORDER = ["Active", "In Progress", "On Hold", "Paused", "Completed", "Archived", "No Status"];

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
  "In Progress": "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
  "On Hold": "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
  Paused: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
  Completed: "bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  Archived: "bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
  "No Status": "bg-gray-50 text-gray-400 border border-gray-100 dark:bg-gray-900/20 dark:text-gray-500 dark:border-gray-800",
};

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function normalizeStatus(status: string | null | undefined): string {
  const s = (status || "").toLowerCase();
  const map: Record<string, string> = {
    active: "Active",
    in_progress: "In Progress",
    on_hold: "On Hold",
    paused: "Paused",
    completed: "Completed",
    archived: "Archived",
  };
  return map[s] || (status ? status : "No Status");
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const label = normalizeStatus(status);
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium", STATUS_COLORS[label] || STATUS_COLORS["No Status"])}>
      {label}
    </span>
  );
}

// ─── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, onDelete }: { project: Project; onDelete: (id: string) => void }) {
  const done = project._completedCount ?? 0;
  const total = project._taskCount ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="group relative bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/8 hover:border-[#99ff33]/60 hover:shadow-[0_4px_20px_rgb(153_255_51/0.12)] transition-all duration-200 overflow-hidden">
      <div className="h-1" style={{ backgroundColor: project.color || "#99ff33" }} />
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <ProjectColorDot icon={project.icon} color={project.color} size="md" />
          <div className="flex-1 min-w-0">
            <Link href={`/projects/${project.id}`} className="font-semibold text-gray-900 dark:text-gray-100 hover:text-[#2d5200] dark:hover:text-[#99ff33] transition-colors line-clamp-1">
              {project.name}
            </Link>
            {project.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{project.description}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="h-7 w-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all">
              <MoreHorizontal size={15} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => (window.location.href = `/projects/${project.id}`)}>
                <FolderOpen size={13} className="mr-2" /> Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => (window.location.href = `/projects/${project.id}?tab=overview`)}>
                <Pencil size={13} className="mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(project.id)} className="text-red-600 focus:text-red-600">
                <Trash2 size={13} className="mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {project.status && (
          <div className="mb-2">
            <StatusBadge status={project.status} />
          </div>
        )}

        {total > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-400">{done}/{total} tasks</span>
              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#22c55e" : project.color || "#99ff33" }} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          {project.category && (
            <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <Building2 size={11} />
              <span className="truncate max-w-[80px]">{project.category}</span>
            </span>
          )}
          {project.teamId && <span className="flex items-center gap-1"><Users size={11} />Team</span>}
          <span className="ml-auto flex items-center gap-1">
            <Clock size={11} />
            {relativeTime(project.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Project row (list view) ────────────────────────────────────────────────────

function ProjectRow({ project, onDelete }: { project: Project; onDelete: (id: string) => void }) {
  const done = project._completedCount ?? 0;
  const total = project._taskCount ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="group flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5 last:border-b-0">
      <ProjectColorDot icon={project.icon} color={project.color} size="sm" />
      <Link href={`/projects/${project.id}`} className="font-medium text-gray-800 dark:text-gray-200 hover:text-[#2d5200] dark:hover:text-[#99ff33] truncate flex-1 text-sm">
        {project.name}
      </Link>
      {project.status && <StatusBadge status={project.status} />}
      {total > 0 && (
        <div className="hidden sm:flex items-center gap-2 w-32">
          <div className="flex-1 h-1 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#22c55e" : project.color || "#99ff33" }} />
          </div>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">{pct}%</span>
        </div>
      )}
      <span className="hidden md:inline text-[11px] text-gray-400 w-24 text-right">{relativeTime(project.updatedAt)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-gray-700 transition-all">
          <MoreHorizontal size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => (window.location.href = `/projects/${project.id}`)}>
            <FolderOpen size={13} className="mr-2" /> Open
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDelete(project.id)} className="text-red-600 focus:text-red-600">
            <Trash2 size={13} className="mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Table view ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sortBy, sortDir }: { col: SortKey; sortBy: SortKey; sortDir: "asc" | "desc" }) {
  if (sortBy !== col) return <ArrowUpDown size={12} className="text-gray-300" />;
  return sortDir === "asc" ? <ArrowUp size={12} className="text-[#99ff33]" /> : <ArrowDown size={12} className="text-[#99ff33]" />;
}

function TableView({ projects, onDelete }: { projects: Project[]; onDelete: (id: string) => void }) {
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: SortKey) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortBy === "name") { av = a.name; bv = b.name; }
      else if (sortBy === "client") { av = a.category || ""; bv = b.category || ""; }
      else if (sortBy === "status") { av = normalizeStatus(a.status); bv = normalizeStatus(b.status); }
      else if (sortBy === "tasks") { av = String(a._taskCount ?? 0).padStart(6, "0"); bv = String(b._taskCount ?? 0).padStart(6, "0"); }
      else if (sortBy === "progress") {
        const aP = (a._taskCount ?? 0) > 0 ? (a._completedCount ?? 0) / (a._taskCount ?? 1) : 0;
        const bP = (b._taskCount ?? 0) > 0 ? (b._completedCount ?? 0) / (b._taskCount ?? 1) : 0;
        av = String(aP).padStart(10, "0"); bv = String(bP).padStart(10, "0");
      }
      else if (sortBy === "updated") { av = a.updatedAt; bv = b.updatedAt; }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [projects, sortBy, sortDir]);

  const thClass = "px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-800 dark:hover:text-gray-200 transition-colors select-none";

  return (
    <div className="border border-gray-200 dark:border-white/8 rounded-xl overflow-hidden bg-white dark:bg-white/3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/8">
            <tr>
              <th className={thClass} onClick={() => handleSort("name")}>
                <span className="flex items-center gap-1">Project <SortIcon col="name" sortBy={sortBy} sortDir={sortDir} /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("client")}>
                <span className="flex items-center gap-1">Client <SortIcon col="client" sortBy={sortBy} sortDir={sortDir} /></span>
              </th>
              <th className={cn(thClass, "hidden md:table-cell")} onClick={() => handleSort("status")}>
                <span className="flex items-center gap-1">Status <SortIcon col="status" sortBy={sortBy} sortDir={sortDir} /></span>
              </th>
              <th className={cn(thClass, "hidden sm:table-cell")} onClick={() => handleSort("tasks")}>
                <span className="flex items-center gap-1">Tasks <SortIcon col="tasks" sortBy={sortBy} sortDir={sortDir} /></span>
              </th>
              <th className={cn(thClass, "hidden sm:table-cell w-40")} onClick={() => handleSort("progress")}>
                <span className="flex items-center gap-1">Progress <SortIcon col="progress" sortBy={sortBy} sortDir={sortDir} /></span>
              </th>
              <th className={cn(thClass, "hidden lg:table-cell")} onClick={() => handleSort("updated")}>
                <span className="flex items-center gap-1">Updated <SortIcon col="updated" sortBy={sortBy} sortDir={sortDir} /></span>
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/5">
            {sorted.map((project) => {
              const done = project._completedCount ?? 0;
              const total = project._taskCount ?? 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <tr key={project.id} className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <ProjectColorDot icon={project.icon} color={project.color} size="sm" />
                      <Link href={`/projects/${project.id}`} className="font-medium text-gray-800 dark:text-gray-200 hover:text-[#2d5200] dark:hover:text-[#99ff33] truncate max-w-[200px]">
                        {project.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[120px] truncate">
                    {project.category && (
                      <span className="flex items-center gap-1">
                        <Building2 size={11} className="shrink-0" />
                        <span className="truncate">{project.category}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell tabular-nums">
                    {total > 0 ? `${done}/${total}` : "—"}
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    {total > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#22c55e" : project.color || "#99ff33" }} />
                        </div>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums w-8 text-right">{pct}%</span>
                      </div>
                    ) : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-400 hidden lg:table-cell whitespace-nowrap">{relativeTime(project.updatedAt)}</td>
                  <td className="px-2 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 transition-all">
                        <MoreHorizontal size={14} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => (window.location.href = `/projects/${project.id}`)}>
                          <FolderOpen size={13} className="mr-2" /> Open
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(project.id)} className="text-red-600 focus:text-red-600">
                          <Trash2 size={13} className="mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No projects match your search.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Generic collapsible group section ──────────────────────────────────────────

function GroupSection({
  label,
  icon,
  projects,
  layoutMode,
  onDelete,
  defaultOpen = true,
}: {
  label: string;
  icon?: React.ReactNode;
  projects: Project[];
  layoutMode: LayoutMode;
  onDelete: (id: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left py-2 group"
      >
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        {icon && <span className="text-gray-500">{icon}</span>}
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
          {label}
        </span>
        <span className="text-[11px] text-gray-400 bg-gray-100 dark:bg-white/8 px-2 py-0.5 rounded-full font-medium ml-1">
          {projects.length}
        </span>
      </button>

      {open && (
        layoutMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
            {projects.map((p) => <ProjectCard key={p.id} project={p} onDelete={onDelete} />)}
          </div>
        ) : (
          <div className="mt-2 border border-gray-200 dark:border-white/8 rounded-xl overflow-hidden bg-white dark:bg-white/3">
            {projects.map((p) => <ProjectRow key={p.id} project={p} onDelete={onDelete} />)}
          </div>
        )
      )}
    </div>
  );
}

// ─── Client branch inside a campaign (legacy) ──────────────────────────────────

function ClientBranch({ client, projects, viewMode, onDelete }: {
  client: string; projects: Project[]; viewMode: "grid" | "list"; onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pl-5 border-l-2 border-gray-200 ml-1">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full py-1.5 text-left group">
        {open ? <ChevronDown size={12} className="text-gray-400 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
        <Building2 size={12} className="text-gray-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">{client}</span>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 rounded-full">{projects.length}</span>
      </button>
      {open && (
        <div className="mt-2 mb-4">
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {projects.map((p) => <ProjectCard key={p.id} project={p} onDelete={onDelete} />)}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {projects.map((p) => <ProjectRow key={p.id} project={p} onDelete={onDelete} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Campaign section (legacy) ─────────────────────────────────────────────────

function CampaignSection({ campaign, projectsByClient, totalProjects, viewMode, onDelete }: {
  campaign: string; projectsByClient: Record<string, Project[]>; totalProjects: number;
  viewMode: "grid" | "list"; onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const clients = Object.keys(projectsByClient).sort((a, b) =>
    a === UNCLAIMED_CLIENT ? 1 : b === UNCLAIMED_CLIENT ? -1 : a.localeCompare(b)
  );

  return (
    <section className="rounded-2xl surface-dark-accent p-5 overflow-hidden relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-3 w-full text-left group">
        <div className="h-8 w-8 rounded-lg bg-[#99ff33] flex items-center justify-center shrink-0 shadow-[0_0_24px_rgb(153_255_51/0.4)]">
          <Megaphone size={15} className="text-[#0d1a00]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white truncate">{campaign}</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#99ff33]/15 text-[#99ff33] border border-[#99ff33]/30">
              {totalProjects} project{totalProjects !== 1 ? "s" : ""}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] text-white/50 border border-white/10">
              {clients.length} client{clients.length !== 1 ? "s" : ""}
            </span>
          </div>
          {campaign === UNGROUPED_CAMPAIGN && (
            <p className="text-[11px] text-white/40 mt-0.5">Projects without a campaign assigned</p>
          )}
        </div>
        <ChevronDown size={18} className={cn("text-white/60 transition-transform shrink-0", !open && "-rotate-90")} />
      </button>

      {open && (
        <div className="mt-5 space-y-2 rounded-xl bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] p-4">
          <div className="space-y-1 bg-white rounded-lg p-3 -m-1">
            {clients.map((client) => (
              <ClientBranch key={client} client={client} projects={projectsByClient[client]} viewMode={viewMode} onDelete={onDelete} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const confirm = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [groupMode, setGroupMode] = useState<GroupMode>("by-campaign");

  // Persist preferences
  useEffect(() => {
    const savedLayout = localStorage.getItem("projects-layout") as LayoutMode | null;
    const savedGroup = localStorage.getItem("projects-group") as GroupMode | null;
    if (savedLayout && ["grid", "list", "table"].includes(savedLayout)) setLayoutMode(savedLayout);
    if (savedGroup && GROUP_OPTIONS.some((g) => g.id === savedGroup)) setGroupMode(savedGroup);
  }, []);

  useEffect(() => { localStorage.setItem("projects-layout", layoutMode); }, [layoutMode]);
  useEffect(() => { localStorage.setItem("projects-group", groupMode); }, [groupMode]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects?limit=500");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  async function deleteProject(id: string) {
    const project = projects.find((p) => p.id === id);
    const ok = await confirm({
      title: "Delete project?",
      description: `"${project?.name}" and all its tasks will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      toastSuccess({ title: "Project deleted" });
      fetchProjects();
    } else {
      toastError({ title: "Failed to delete project" });
    }
  }

  const campaigns = useMemo(() =>
    Array.from(new Set(projects.map((p) => p.campaign || UNGROUPED_CAMPAIGN))).sort((a, b) =>
      a === UNGROUPED_CAMPAIGN ? 1 : b === UNGROUPED_CAMPAIGN ? -1 : a.localeCompare(b)
    ), [projects]
  );

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const matchSearch = !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (p.category ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (p.campaign ?? "").toLowerCase().includes(search.toLowerCase());
      const matchCampaign = groupMode !== "by-campaign" || campaignFilter === "all" ||
        (p.campaign || UNGROUPED_CAMPAIGN) === campaignFilter;
      return matchSearch && matchCampaign;
    });
  }, [projects, search, campaignFilter, groupMode]);

  // Build grouped data for non-campaign modes
  const groupedSections = useMemo(() => {
    if (groupMode === "by-campaign" || groupMode === "all" || layoutMode === "table") return [];

    if (groupMode === "by-client" || groupMode === "by-category") {
      const groups: Record<string, Project[]> = {};
      for (const p of filtered) {
        const key = p.category || (groupMode === "by-client" ? UNCLAIMED_CLIENT : "Other");
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      }
      const noGroup = groupMode === "by-client" ? UNCLAIMED_CLIENT : "Other";
      return Object.entries(groups)
        .sort(([a], [b]) => a === noGroup ? 1 : b === noGroup ? -1 : a.localeCompare(b))
        .map(([label, ps]) => ({ label, projects: ps }));
    }

    if (groupMode === "by-status") {
      const groups: Record<string, Project[]> = {};
      for (const p of filtered) {
        const key = normalizeStatus(p.status);
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      }
      return STATUS_ORDER.filter((s) => groups[s]).map((s) => ({ label: s, projects: groups[s] }));
    }

    return [];
  }, [filtered, groupMode, layoutMode]);

  // Campaign hierarchy for by-campaign mode
  const campaignGrouped = useMemo(() => {
    if (groupMode !== "by-campaign") return {};
    const grouped: Record<string, Record<string, Project[]>> = {};
    for (const p of filtered) {
      const c = p.campaign || UNGROUPED_CAMPAIGN;
      const cl = p.category || UNCLAIMED_CLIENT;
      if (!grouped[c]) grouped[c] = {};
      if (!grouped[c][cl]) grouped[c][cl] = [];
      grouped[c][cl].push(p);
    }
    return grouped;
  }, [filtered, groupMode]);

  const visibleCampaigns = Object.keys(campaignGrouped).sort((a, b) =>
    a === UNGROUPED_CAMPAIGN ? 1 : b === UNGROUPED_CAMPAIGN ? -1 : a.localeCompare(b)
  );

  const clientCount = Array.from(new Set(projects.map((p) => p.category).filter(Boolean))).length;

  const groupIconMap: Record<GroupMode, React.ReactNode> = {
    "by-campaign": <Megaphone size={12} />,
    "by-client": <Building2 size={12} />,
    "by-status": <CheckCircle2 size={12} />,
    "by-category": <Tag size={12} />,
    "all": <FolderOpen size={12} />,
  };

  return (
    <div className="flex flex-col h-full min-h-0 animate-fade-in bg-gray-50 dark:bg-[#0a0e0a]">
      {/* ── Sticky header ── */}
      <div className="glass-strong sticky top-0 z-10 px-6 py-4 border-b border-gray-200 dark:border-white/8 bg-white dark:bg-[#141814]">
        <div className="flex items-center gap-3 mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Projects</h1>
            <p className="text-xs text-gray-500">
              {projects.length} project{projects.length !== 1 ? "s" : ""} ·{" "}
              {campaigns.filter((c) => c !== UNGROUPED_CAMPAIGN).length} campaign{campaigns.filter((c) => c !== UNGROUPED_CAMPAIGN).length !== 1 ? "s" : ""} ·{" "}
              {clientCount} client{clientCount !== 1 ? "s" : ""}
            </p>
          </div>
          <Link href="/projects/new" className="ml-auto">
            <Button className="btn-brand gap-1.5 shadow-none border-0 h-9 px-4">
              <Plus size={15} />
              New Project
            </Button>
          </Link>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative min-w-0 flex-1 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects, clients, campaigns…"
              className="h-8 pl-7 text-sm border-gray-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
            />
          </div>

          {/* Group mode selector */}
          <div className="flex items-center gap-1 border border-gray-200 dark:border-white/10 rounded-lg p-0.5 bg-white dark:bg-white/5">
            {GROUP_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setGroupMode(opt.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0",
                  groupMode === opt.id
                    ? "bg-[#0d1a00] text-[#99ff33] shadow-[0_0_8px_rgb(153_255_51/0.2)]"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8"
                )}
              >
                {groupIconMap[opt.id]}
                {opt.label}
              </button>
            ))}
          </div>

          {/* Layout toggle */}
          <div className="flex items-center gap-0.5 border border-gray-200 dark:border-white/10 rounded-lg p-0.5 bg-white dark:bg-white/5">
            {([
              { id: "grid" as const, icon: <LayoutGrid size={13} />, label: "Grid" },
              { id: "list" as const, icon: <List size={13} />, label: "List" },
              { id: "table" as const, icon: <Table2 size={13} />, label: "Table" },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setLayoutMode(opt.id)}
                aria-label={opt.label}
                className={cn(
                  "h-6 w-7 flex items-center justify-center rounded-md transition-colors",
                  layoutMode === opt.id ? "bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-gray-100" : "text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        </div>

        {/* Campaign filter pills (only in by-campaign mode) */}
        {groupMode === "by-campaign" && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setCampaignFilter("all")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0",
                campaignFilter === "all"
                  ? "bg-[#0d1a00] text-[#99ff33] shadow-[0_0_12px_rgb(153_255_51/0.3)]"
                  : "bg-gray-100 dark:bg-white/8 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/12"
              )}
            >
              All Campaigns
            </button>
            {campaigns.map((c) => (
              <button
                key={c}
                onClick={() => setCampaignFilter(c)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 shrink-0",
                  campaignFilter === c
                    ? "bg-[#0d1a00] text-[#99ff33] shadow-[0_0_12px_rgb(153_255_51/0.3)]"
                    : "bg-gray-100 dark:bg-white/8 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/12"
                )}
              >
                {c !== UNGROUPED_CAMPAIGN && <Megaphone size={10} />}
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => <div key={i} className="h-40 rounded-2xl bg-gray-100 dark:bg-white/5 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 rounded-2xl surface-dark-accent flex items-center justify-center mb-4">
              <FolderOpen size={28} className="text-[#99ff33]" />
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-semibold text-lg mb-1">No projects yet</p>
            <p className="text-gray-400 text-sm mb-6">Create your first project to get started</p>
            <Link href="/projects/new">
              <Button className="btn-brand gap-1.5 h-10 px-5"><Plus size={15} /> New Project</Button>
            </Link>
          </div>
        ) : (
          <div className="max-w-[1400px] mx-auto">
            {/* Table view (always flat) */}
            {layoutMode === "table" && (
              <TableView projects={filtered} onDelete={deleteProject} />
            )}

            {/* By Campaign (legacy hierarchy) */}
            {layoutMode !== "table" && groupMode === "by-campaign" && (
              <div className="space-y-5">
                {visibleCampaigns.map((campaign) => (
                  <CampaignSection
                    key={campaign}
                    campaign={campaign}
                    projectsByClient={campaignGrouped[campaign]}
                    totalProjects={Object.values(campaignGrouped[campaign]).flat().length}
                    viewMode={layoutMode === "grid" ? "grid" : "list"}
                    onDelete={deleteProject}
                  />
                ))}
              </div>
            )}

            {/* All Projects (flat, no grouping) */}
            {layoutMode !== "table" && groupMode === "all" && (
              layoutMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filtered.map((p) => <ProjectCard key={p.id} project={p} onDelete={deleteProject} />)}
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-white/8 rounded-xl overflow-hidden bg-white dark:bg-white/3">
                  {filtered.map((p) => <ProjectRow key={p.id} project={p} onDelete={deleteProject} />)}
                </div>
              )
            )}

            {/* Generic sections (By Client, By Status, By Category) */}
            {layoutMode !== "table" && groupMode !== "by-campaign" && groupMode !== "all" && (
              <div>
                {groupedSections.map((section) => (
                  <GroupSection
                    key={section.label}
                    label={section.label}
                    icon={groupIconMap[groupMode]}
                    projects={section.projects}
                    layoutMode={layoutMode}
                    onDelete={deleteProject}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
