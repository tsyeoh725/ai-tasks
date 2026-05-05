"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { JobStatusBadge } from "@/components/job-status-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { CreateClientDialog } from "@/components/create-client-dialog";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { useSidebar } from "@/components/sidebar-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckSquare,
  FolderOpen,
  Users,
  Target,
  FileText,
  Receipt,
  Menu,
  X,
  Plus,
} from "lucide-react";

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: "⌘K", description: "Open global search / command palette" },
  { keys: "⌘N", description: "Create a new task" },
  { keys: "⌘/", description: "Open this shortcuts dialog" },
  { keys: "?", description: "Open this shortcuts dialog" },
  { keys: "Esc", description: "Close dialogs and menus" },
];

const MENU_ITEMS = [
  {
    key: "task",
    icon: CheckSquare,
    label: "New Task",
    description: "Add a task to a project",
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/40",
  },
  {
    key: "project",
    icon: FolderOpen,
    label: "New Project",
    description: "Start a client project",
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-950/40",
  },
  {
    key: "client",
    icon: Users,
    label: "New Client",
    description: "Add a client account",
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  {
    key: "lead",
    icon: Target,
    label: "New Lead",
    description: "Track a sales opportunity",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/40",
  },
  {
    key: "goal",
    icon: Target,
    label: "New Goal",
    description: "Set an OKR or objective",
    color: "text-rose-500",
    bg: "bg-rose-50 dark:bg-rose-950/40",
  },
  {
    key: "doc",
    icon: FileText,
    label: "New Doc",
    description: "Write a document or brief",
    color: "text-sky-500",
    bg: "bg-sky-50 dark:bg-sky-950/40",
  },
  {
    key: "invoice",
    icon: Receipt,
    label: "New Invoice",
    description: "Create a client invoice",
    color: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/40",
  },
] as const;

type MenuKey = (typeof MENU_ITEMS)[number]["key"];

export function TopHeader() {
  const router = useRouter();
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { open: sidebarOpen, toggle: toggleSidebar } = useSidebar();

  useEffect(() => {
    function onCreateTask() {
      setCreateTaskOpen(true);
    }
    window.addEventListener("command-palette:create-task", onCreateTask);
    return () =>
      window.removeEventListener("command-palette:create-task", onCreateTask);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const editable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (editable) return;
      if (e.key === "?" || ((e.metaKey || e.ctrlKey) && e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleMenuSelect(key: MenuKey) {
    setMenuOpen(false);
    switch (key) {
      case "task":
        setCreateTaskOpen(true);
        break;
      case "project":
        setCreateProjectOpen(true);
        break;
      case "client":
        setCreateClientOpen(true);
        break;
      case "lead":
        router.push("/crm?new=1");
        break;
      case "goal":
        router.push("/goals?new=1");
        break;
      case "doc":
        router.push("/documents/new");
        break;
      case "invoice":
        router.push("/clients");
        break;
    }
  }

  return (
    <>
      <div className="h-12 bg-white dark:bg-[#0d130d] border-b border-slate-200 dark:border-white/10 flex items-center gap-2 px-4 shrink-0 relative z-10 shadow-sm">
        {/* Mobile sidebar toggle */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="md:hidden h-9 w-9 -ml-1 mr-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          title={sidebarOpen ? "Close menu" : "Open menu"}
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 mr-4 rounded-md hover:opacity-80 transition-opacity"
          aria-label="AI Tasks home"
        >
          <Image
            src="/logo-light.png"
            alt=""
            width={28}
            height={28}
            priority
            className="rounded-md block dark:hidden"
          />
          <Image
            src="/logo-dark.png"
            alt=""
            width={28}
            height={28}
            priority
            className="rounded-md hidden dark:block"
          />
          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
            AI Tasks
          </span>
        </Link>

        {/* Create command menu */}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                className="gap-1.5 h-8 btn-brand shadow-sm"
              />
            }
          >
            <Plus className="h-4 w-4" />
            Create
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 p-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1.5 mb-0.5">
              Create new
            </p>
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleMenuSelect(item.key)}
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-muted/60 transition-colors group"
                >
                  <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${item.bg}`}>
                    <Icon className={`h-4 w-4 ${item.color}`} />
                  </span>
                  <span>
                    <span className="block text-sm font-medium leading-tight">{item.label}</span>
                    <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Global search */}
        <div className="flex-1 max-w-xl ml-4">
          <GlobalSearch />
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1 ml-auto">
          <ThemeToggle compact />
          <JobStatusBadge />
          <NotificationBell />
          <button
            onClick={() => setShortcutsOpen(true)}
            className="hidden md:flex h-9 w-9 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 items-center justify-center text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
            title="Keyboard shortcuts (?)"
            type="button"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      <CreateTaskDialog open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
      <CreateClientDialog open={createClientOpen} onOpenChange={setCreateClientOpen} />
      <CreateProjectDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              Speed up navigation with these shortcuts.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-1.5">
            {SHORTCUTS.map((s) => (
              <div
                key={s.keys}
                className="flex items-center justify-between text-sm py-1.5"
              >
                <span className="text-slate-600">{s.description}</span>
                <kbd className="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 font-mono text-xs text-slate-700">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
