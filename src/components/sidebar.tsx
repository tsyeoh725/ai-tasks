"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { useSidebar } from "@/components/sidebar-context";
import { useWorkspace } from "@/components/workspace-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  CheckSquare,
  CalendarDays,
  Sparkles,
  Target as GoalIcon,
  BarChart3,
  FileText,
  Package,
  Briefcase,
  Building2,
  Gauge,
  FolderOpen,
  Star,
  Plus,
  Target as BrandIcon,
  LineChart,
  CheckCircle,
  BookOpen,
  Brain,
  Activity,
  HeartPulse,
  ChevronDown,
  ChevronRight,
  Users2,
  Zap,
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
};

type Team = {
  id: string;
  name: string;
};

type Favorite = {
  id: string;
  entityType: string;
  entityId: string;
};

type Mode = "work" | "marketing";

type NavItemProps = {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
};

function NavItem({ href, active, icon, label, badge }: NavItemProps) {
  const { setOpen } = useSidebar();
  return (
    <Link
      href={href}
      // Close the mobile sidebar drawer immediately on click — avoids cases
      // where the overlay intercepts the next click during route transition.
      onClick={() => setOpen(false)}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 min-h-9 text-sm font-medium transition-all",
        active
          ? "bg-[#99ff33]/15 text-gray-900 dark:text-slate-100 font-semibold"
          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[#99ff33]"
        />
      )}
      <span className={cn("shrink-0", active ? "text-gray-800 dark:text-slate-200" : "text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white")}>
        {icon}
      </span>
      <span className="truncate flex-1">{label}</span>
      {badge && <span className="shrink-0">{badge}</span>}
    </Link>
  );
}

function CollapsibleSection({
  label,
  action,
  children,
  defaultOpen = true,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const storageKey = `sidebar:section:${label}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const saved = window.localStorage.getItem(`sidebar:section:${label}`);
    if (saved === "0") return false;
    if (saved === "1") return true;
    return defaultOpen;
  });

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <div className="mt-4">
      <div className="mb-1.5 px-3 flex items-center justify-between">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-expanded={open}
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform",
              open && "rotate-90"
            )}
          />
          {label}
        </button>
        {action}
      </div>
      {open && children}
    </div>
  );
}

const MARKETING_PATHS = [
  "/brands",
  "/ads",
  "/approvals",
  "/journal",
  "/memory",
  "/marketing",
];

function pickModeFromPath(pathname: string): Mode {
  return MARKETING_PATHS.some((p) => pathname.startsWith(p)) ? "marketing" : "work";
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const { workspace, setWorkspace } = useWorkspace();
  const activeWorkspace: string = workspace.kind === "personal" ? "personal" : workspace.teamId;
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [mode, setMode] = useState<Mode>(() => pickModeFromPath(pathname));
  const { open: mobileOpen } = useSidebar();

  useEffect(() => {
    setMode(pickModeFromPath(pathname));
  }, [pathname]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});

    fetch("/api/favorites")
      .then((r) => r.json())
      .then((data) => setFavorites(data.favorites || []))
      .catch(() => {});

    fetch("/api/approvals")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.entries || [];
        setPendingApprovals(list.length);
      })
      .catch(() => {});
    // Re-fetch projects + approvals when the workspace cookie changes — they
    // are workspace-scoped on the server. Teams list is always all-of-mine.
  }, [workspace]);

  // Teams list is independent of which workspace is active. Refetch on
  // window focus so a newly-added membership shows up without a hard reload.
  useEffect(() => {
    function loadTeams() {
      fetch("/api/teams")
        .then((r) => r.json())
        .then((data) => setTeams(data.teams || []))
        .catch(() => {});
    }
    loadTeams();
    window.addEventListener("focus", loadTeams);
    return () => window.removeEventListener("focus", loadTeams);
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col w-64 bg-white dark:bg-[#0d130d] border-r border-slate-200 dark:border-white/10",
        "fixed inset-y-0 top-12 left-0 z-40 transform transition-transform duration-200 ease-out",
        "md:relative md:top-0 md:translate-x-0 md:z-auto",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      {/* Header: workspace + module toggle */}
      <div className="p-3 border-b border-slate-100 dark:border-white/10 space-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full flex items-center gap-2 font-semibold text-sm px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-colors">
            <div className="h-6 w-6 rounded-md bg-[#99ff33] flex items-center justify-center text-xs font-bold text-[#0d1a00]">
              {activeWorkspace === "personal"
                ? (session?.user?.name?.[0]?.toUpperCase() || "P")
                : (teams.find((t) => t.id === activeWorkspace)?.name[0] || "T")}
            </div>
            <span className="truncate text-slate-800 dark:text-slate-200">
              {activeWorkspace === "personal"
                ? "Personal"
                : teams.find((t) => t.id === activeWorkspace)?.name || "Workspace"}
            </span>
            <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => setWorkspace({ kind: "personal" })}>
              Personal
            </DropdownMenuItem>
            {teams.length > 0 && <Separator />}
            {teams.map((team) => (
              <DropdownMenuItem
                key={team.id}
                onClick={() => setWorkspace({ kind: "team", teamId: team.id })}
              >
                {team.name}
              </DropdownMenuItem>
            ))}
            <Separator />
            <DropdownMenuItem onClick={() => (window.location.href = "/teams")}>
              Manage Teams
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Module toggle */}
        <div className="flex items-center rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-0.5">
          <button
            type="button"
            onClick={() => setMode("work")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all",
              mode === "work"
                ? "bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white",
            )}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Work
          </button>
          <button
            type="button"
            onClick={() => setMode("marketing")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all relative",
              mode === "marketing"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Marketing
            {pendingApprovals > 0 && mode !== "marketing" && (
              <span className="absolute top-0.5 right-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 min-h-0 px-2 py-3">
        {mode === "work" ? (
          <WorkNav
            pathname={pathname}
            projects={projects}
            favorites={favorites}
          />
        ) : (
          <MarketingNav
            pathname={pathname}
            pendingApprovals={pendingApprovals}
          />
        )}
      </ScrollArea>

      {/* User */}
      <div className="border-t border-slate-100 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <div className="h-7 w-7 rounded-full bg-[#99ff33] flex items-center justify-center text-xs font-semibold text-[#0d1a00]">
              {session?.user?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <span className="truncate text-sm text-slate-700">{session?.user?.name || "User"}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => (window.location.href = "/settings")}>
              Settings
            </DropdownMenuItem>
            <Separator />
            <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function WorkNav({
  pathname,
  projects,
  favorites,
}: {
  pathname: string;
  projects: Project[];
  favorites: Favorite[];
}) {
  return (
    <div className="px-1">
      <nav className="space-y-0.5">
        <NavItem
          href="/"
          active={pathname === "/"}
          label="Dashboard"
          icon={<LayoutDashboard className="h-4 w-4" />}
        />
        <NavItem
          href="/tasks"
          active={pathname.startsWith("/tasks")}
          label="My Tasks"
          icon={<CheckSquare className="h-4 w-4" />}
        />
        <NavItem
          href="/schedule"
          active={pathname.startsWith("/schedule")}
          label="Schedule"
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <NavItem
          href="/clients"
          active={pathname.startsWith("/projects") || pathname.startsWith("/clients")}
          label="Clients"
          icon={<Building2 className="h-4 w-4" />}
        />
        <NavItem
          href="/crm"
          active={pathname.startsWith("/crm")}
          label="CRM"
          icon={<Zap className="h-4 w-4" />}
        />
        <NavItem
          href="/team"
          active={pathname.startsWith("/team") && !pathname.startsWith("/teams")}
          label="My Team"
          icon={<Users2 className="h-4 w-4" />}
        />
        <NavItem
          href="/ai"
          active={pathname === "/ai" || pathname.startsWith("/ai/")}
          label="AI Assistant"
          icon={<Sparkles className="h-4 w-4" />}
        />
      </nav>

      <CollapsibleSection label="Plan">
        <nav className="space-y-0.5">
          <NavItem
            href="/portfolios"
            active={pathname.startsWith("/portfolios")}
            label="Portfolios"
            icon={<Briefcase className="h-4 w-4" />}
          />
          <NavItem
            href="/goals"
            active={pathname.startsWith("/goals")}
            label="Goals"
            icon={<GoalIcon className="h-4 w-4" />}
          />
          <NavItem
            href="/workload"
            active={pathname.startsWith("/workload")}
            label="Workload"
            icon={<Gauge className="h-4 w-4" />}
          />
          <NavItem
            href="/reports"
            active={pathname.startsWith("/reports")}
            label="Reports"
            icon={<BarChart3 className="h-4 w-4" />}
          />
        </nav>
      </CollapsibleSection>

      <CollapsibleSection label="Library">
        <nav className="space-y-0.5">
          <NavItem
            href="/templates"
            active={pathname.startsWith("/templates")}
            label="Templates"
            icon={<FileText className="h-4 w-4" />}
          />
          <NavItem
            href="/bundles"
            active={pathname.startsWith("/bundles")}
            label="Bundles"
            icon={<Package className="h-4 w-4" />}
          />
        </nav>
      </CollapsibleSection>

      {favorites.length > 0 && (
        <CollapsibleSection label="Favorites">
          <nav className="space-y-0.5">
            {favorites.map((fav) => {
              const project = fav.entityType === "project" ? projects.find((p) => p.id === fav.entityId) : null;
              const href = fav.entityType === "project" ? `/projects/${fav.entityId}` : `/tasks/${fav.entityId}`;
              const label = project ? project.name : fav.entityId.substring(0, 8);
              const icon = project ? (
                project.icon ? (
                  <span className="text-sm">{project.icon}</span>
                ) : (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                )
              ) : (
                <Star className="h-3.5 w-3.5" />
              );
              return (
                <NavItem
                  key={fav.id}
                  href={href}
                  active={pathname === href}
                  label={label}
                  icon={icon}
                />
              );
            })}
          </nav>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        label="Projects"
        action={
          <div className="flex items-center gap-1">
            <Link href="/projects">
              <Button variant="ghost" size="icon-xs" className="h-5 w-5 text-slate-400 hover:text-slate-700" title="All projects">
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href="/projects/new">
              <Button variant="ghost" size="icon-xs" className="h-5 w-5 text-slate-400 hover:text-slate-700" title="New project">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        }
      >
        <nav className="space-y-0.5">
          {projects.map((project) => (
            <NavItem
              key={project.id}
              href={`/projects/${project.id}`}
              active={pathname === `/projects/${project.id}`}
              label={project.name}
              icon={
                project.icon ? (
                  <span className="text-sm">{project.icon}</span>
                ) : (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                )
              }
            />
          ))}
          {projects.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">No projects yet</p>
          )}
        </nav>
      </CollapsibleSection>
    </div>
  );
}

function MarketingNav({
  pathname,
  pendingApprovals,
}: {
  pathname: string;
  pendingApprovals: number;
}) {
  return (
    <div className="px-1">
      <nav className="space-y-0.5">
        <NavItem
          href="/brands"
          active={pathname.startsWith("/brands")}
          label="Brands"
          icon={<BrandIcon className="h-4 w-4" />}
        />
        <NavItem
          href="/ads"
          active={pathname.startsWith("/ads")}
          label="Ads"
          icon={<LineChart className="h-4 w-4" />}
        />
      </nav>

      <CollapsibleSection label="Operate">
        <nav className="space-y-0.5">
          <NavItem
            href="/approvals"
            active={pathname.startsWith("/approvals")}
            label="Approvals"
            icon={<CheckCircle className="h-4 w-4" />}
            badge={
              pendingApprovals > 0 ? (
                <span className="text-[10px] font-mono bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                  {pendingApprovals}
                </span>
              ) : null
            }
          />
          <NavItem
            href="/journal"
            active={pathname.startsWith("/journal")}
            label="Decision Journal"
            icon={<BookOpen className="h-4 w-4" />}
          />
          <NavItem
            href="/memory"
            active={pathname.startsWith("/memory")}
            label="AI Memory"
            icon={<Brain className="h-4 w-4" />}
          />
        </nav>
      </CollapsibleSection>

      <CollapsibleSection label="System">
        <nav className="space-y-0.5">
          <NavItem
            href="/marketing/logs"
            active={pathname === "/marketing/logs"}
            label="Logs"
            icon={<Activity className="h-4 w-4" />}
          />
          <NavItem
            href="/marketing/health"
            active={pathname === "/marketing/health"}
            label="Health"
            icon={<HeartPulse className="h-4 w-4" />}
          />
        </nav>
      </CollapsibleSection>

      <div className="mt-6 mx-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen className="h-3.5 w-3.5 text-indigo-500" />
          <span className="text-[11px] font-semibold text-slate-700">Linked projects</span>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Each brand has a linked project. Switch to <span className="text-slate-700 font-medium">Work</span> to see ad-driven tasks.
        </p>
      </div>
    </div>
  );
}
