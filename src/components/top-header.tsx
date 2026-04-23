"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { GlobalSearch } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";
import { CreateTaskDialog } from "@/components/create-task-dialog";
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
  Briefcase,
  Menu,
  X,
} from "lucide-react";

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: "⌘K", description: "Open global search / command palette" },
  { keys: "⌘N", description: "Create a new task" },
  { keys: "⌘/", description: "Open this shortcuts dialog" },
  { keys: "?", description: "Open this shortcuts dialog" },
  { keys: "Esc", description: "Close dialogs and menus" },
];

export function TopHeader() {
  const router = useRouter();
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { open: sidebarOpen, toggle: toggleSidebar } = useSidebar();

  useEffect(() => {
    function onCreateTask() {
      setCreateTaskOpen(true);
    }
    window.addEventListener("command-palette:create-task", onCreateTask);
    return () =>
      window.removeEventListener(
        "command-palette:create-task",
        onCreateTask,
      );
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

  return (
    <>
      <div className="h-12 bg-white/[0.02] backdrop-blur-xl border-b border-white/[0.08] flex items-center gap-2 px-4 shrink-0 relative z-10">
        {/* Mobile sidebar toggle */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="md:hidden h-11 w-11 -ml-2 mr-1 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-white/70 hover:text-white transition-colors"
          title={sidebarOpen ? "Close menu" : "Open menu"}
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Logo/brand */}
        <div className="font-semibold text-sm mr-4 bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
          AI Tasks
        </div>

        {/* Create button */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                className="gap-1.5 h-8 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-400 hover:to-pink-400 text-white border-white/10 shadow-[0_4px_20px_rgb(249_115_22/0.3)] hover:shadow-[0_4px_24px_rgb(249_115_22/0.45)]"
              />
            }
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => setCreateTaskOpen(true)}>
              <CheckSquare className="mr-2 h-4 w-4 text-white/50" />
              Task
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/projects/new")}>
              <FolderOpen className="mr-2 h-4 w-4 text-white/50" />
              Project
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/teams")}>
              <Users className="mr-2 h-4 w-4 text-white/50" />
              Team
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/goals")}>
              <Target className="mr-2 h-4 w-4 text-white/50" />
              Goal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/portfolios")}>
              <Briefcase className="mr-2 h-4 w-4 text-white/50" />
              Portfolio
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Global search */}
        <div className="flex-1 max-w-xl ml-4">
          <GlobalSearch />
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1 ml-auto">
          <NotificationBell />
          <button
            onClick={() => setShortcutsOpen(true)}
            className="hidden md:flex h-9 w-9 rounded-lg hover:bg-white/[0.06] items-center justify-center text-white/50 hover:text-white/80 transition-colors"
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
                <span className="text-white/70">{s.description}</span>
                <kbd className="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.04] font-mono text-xs text-white/80">
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
