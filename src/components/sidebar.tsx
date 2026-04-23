"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { useSidebar } from "@/components/sidebar-context";
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
  // Work mode icons
  LayoutDashboard,
  CheckSquare,
  CalendarDays,
  Sparkles,
  Target as GoalIcon,
  BarChart3,
  FileText,
  FormInput,
  Package,
  Briefcase,
  Gauge,
  FolderOpen,
  Star,
  Plus,
  // Marketing mode icons
  Target as BrandIcon,
  LineChart,
  CheckCircle,
  BookOpen,
  Brain,
  Activity,
  HeartPulse,
  ChevronDown,
  ChevronRight,
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
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
        active
          ? "bg-white/[0.06] text-white"
          : "text-white/60 hover:bg-white/[0.04] hover:text-white/90",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-px rounded-full bg-gradient-to-b from-indigo-400 to-cyan-400 shadow-[0_0_8px_rgb(129_140_248/0.6)]"
        />
      )}
      <span className={cn("shrink-0", active ? "text-indigo-300" : "text-white/50 group-hover:text-white/80")}>
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
  const [open, setOpen] = useState<boolean>(defaultOpen);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "0") setOpen(false);
    else if (saved === "1") setOpen(true);
  }, [storageKey]);

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
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/35 hover:text-white/70 transition-colors"
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
  const [activeWorkspace, setActiveWorkspace] = useState<string>("personal");
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [mode, setMode] = useState<Mode>(() => pickModeFromPath(pathname));
  const { open: mobileOpen } = useSidebar();

  // Auto-switch mode if user navigates to a route in the other module
  useEffect(() => {
    setMode(pickModeFromPath(pathname));
  }, [pathname]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});

    fetch("/api/teams")
      .then((r) => r.json())
      .then((data) => setTeams(data.teams || []))
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
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col w-64 bg-[rgb(15_15_25/0.92)] md:bg-white/[0.02] backdrop-blur-xl border-r border-white/[0.08]",
        "fixed inset-y-0 top-12 left-0 z-40 transform transition-transform duration-200 ease-out",
        "md:relative md:top-0 md:translate-x-0 md:z-auto",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      {/* Header: workspace + module toggle */}
      <div className="p-3 border-b border-white/[0.06] space-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full flex items-center gap-2 font-semibold text-sm px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] transition-colors">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-xs font-bold text-white shadow-[0_2px_10px_rgb(99_102_241/0.4)]">
              {activeWorkspace === "personal"
                ? (session?.user?.name?.[0]?.toUpperCase() || "P")
                : (teams.find((t) => t.id === activeWorkspace)?.name[0] || "T")}
            </div>
            <span className="truncate text-white/90">
              {activeWorkspace === "personal"
                ? "Personal"
                : teams.find((t) => t.id === activeWorkspace)?.name || "Workspace"}
            </span>
            <ChevronDown className="ml-auto h-4 w-4 text-white/40" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => setActiveWorkspace("personal")}>
              Personal
            </DropdownMenuItem>
            {teams.length > 0 && <Separator />}
            {teams.map((team) => (
              <DropdownMenuItem key={team.id} onClick={() => setActiveWorkspace(team.id)}>
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
        <div className="flex items-center rounded-lg bg-white/[0.03] border border-white/[0.06] p-0.5">
          <button
            type="button"
            onClick={() => setMode("work")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all",
              mode === "work"
                ? "bg-white/[0.08] text-white shadow-sm"
                : "text-white/50 hover:text-white/80",
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
                ? "bg-white/[0.08] text-white shadow-sm"
                : "text-white/50 hover:text-white/80",
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Marketing
            {pendingApprovals > 0 && mode !== "marketing" && (
              <span className="absolute top-0.5 right-1 h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgb(251_191_36/0.8)]" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation — varies by mode */}
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
      <div className="border-t border-white/[0.06] p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.05] transition-colors">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-xs font-semibold text-white shadow-[0_2px_12px_rgb(99_102_241/0.35)]">
              {session?.user?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <span className="truncate text-sm text-white/80">{session?.user?.name || "User"}</span>
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
          href="/ai"
          active={pathname === "/ai" || pathname.startsWith("/ai/")}
          label="AI Assistant"
          icon={<Sparkles className="h-4 w-4" />}
        />
      </nav>

      {/* Plan */}
      <CollapsibleSection label="Plan">
        <nav className="space-y-0.5">
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
          <NavItem
            href="/portfolios"
            active={pathname.startsWith("/portfolios")}
            label="Portfolios"
            icon={<Briefcase className="h-4 w-4" />}
          />
        </nav>
      </CollapsibleSection>

      {/* Library */}
      <CollapsibleSection label="Library">
        <nav className="space-y-0.5">
          <NavItem
            href="/templates"
            active={pathname.startsWith("/templates")}
            label="Templates"
            icon={<FileText className="h-4 w-4" />}
          />
          <NavItem
            href="/forms"
            active={pathname.startsWith("/forms")}
            label="Forms"
            icon={<FormInput className="h-4 w-4" />}
          />
          <NavItem
            href="/bundles"
            active={pathname.startsWith("/bundles")}
            label="Bundles"
            icon={<Package className="h-4 w-4" />}
          />
        </nav>
      </CollapsibleSection>

      {/* Favorites */}
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
                    className="h-2 w-2 rounded-full shadow-[0_0_6px_currentColor]"
                    style={{ backgroundColor: project.color, color: project.color }}
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

      {/* Projects */}
      <CollapsibleSection
        label="Projects"
        action={
          <Link href="/projects/new">
            <Button variant="ghost" size="icon-xs" className="h-5 w-5 text-white/40 hover:text-white/80">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </Link>
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
                    className="h-2 w-2 rounded-full shadow-[0_0_6px_currentColor]"
                    style={{ backgroundColor: project.color, color: project.color }}
                  />
                )
              }
            />
          ))}
          {projects.length === 0 && (
            <p className="px-3 py-2 text-xs text-white/40">No projects yet</p>
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
      {/* Overview */}
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

      {/* Operate */}
      <CollapsibleSection label="Operate">
        <nav className="space-y-0.5">
          <NavItem
            href="/approvals"
            active={pathname.startsWith("/approvals")}
            label="Approvals"
            icon={<CheckCircle className="h-4 w-4" />}
            badge={
              pendingApprovals > 0 ? (
                <span className="text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-400/20 px-1.5 py-0.5 rounded-full">
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

      {/* System */}
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

      {/* Help */}
      <div className="mt-6 mx-3 p-3 rounded-xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen className="h-3.5 w-3.5 text-indigo-300" />
          <span className="text-[11px] font-semibold text-white/80">Linked projects</span>
        </div>
        <p className="text-[10px] text-white/50 leading-relaxed">
          Each brand has a linked project. Switch to <span className="text-white/70">Work</span> to see ad-driven tasks.
        </p>
      </div>
    </div>
  );
}
