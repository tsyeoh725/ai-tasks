"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CheckSquare,
  FolderOpen,
  Search,
  ArrowRight,
  Plus,
  Calendar,
  Settings,
  Briefcase,
  Target,
  FileText,
  FormInput,
  Package,
  LayoutList,
  BarChart3,
  Sparkles,
  Clock,
  Loader2,
  Building2,
  Megaphone,
} from "lucide-react";

// ============ TYPES ============

export type CommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  group: "tasks" | "projects" | "clients" | "brands" | "actions" | "pages";
  icon?: React.ReactNode;
  onSelect: () => void;
};

type CommandPaletteContextValue = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteProvider",
    );
  }
  return ctx;
}

// ============ LOCAL STORAGE FOR RECENTLY VISITED ============

const RECENT_KEY = "commandPalette:recentTasks";
const RECENT_MAX = 8;

type RecentEntry = {
  id: string;
  title: string;
  subtitle?: string;
  visitedAt: number;
};

function readRecentTasks(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.id === "string" && typeof e.title === "string")
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function recordRecentTask(entry: Omit<RecentEntry, "visitedAt">) {
  if (typeof window === "undefined") return;
  try {
    const list = readRecentTasks().filter((e) => e.id !== entry.id);
    list.unshift({ ...entry, visitedAt: Date.now() });
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(list.slice(0, RECENT_MAX)),
    );
  } catch {
    // ignore
  }
}

// ============ FUZZY SEARCH ============

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) {
    // Strong match: prefer shorter and earlier matches
    const idx = t.indexOf(q);
    return 100 - idx - (t.length - q.length) * 0.1;
  }
  // Subsequence match: chars appear in order
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++;
      streak++;
      score += 1 + streak;
    } else {
      streak = 0;
    }
  }
  if (qi < q.length) return 0;
  return score;
}

// ============ STATIC DATA ============

type PageDef = {
  title: string;
  subtitle?: string;
  path: string;
  icon: React.ReactNode;
};

const PAGES: PageDef[] = [
  { title: "Tasks", subtitle: "My tasks across projects", path: "/tasks", icon: <CheckSquare className="h-4 w-4" /> },
  { title: "Schedule", subtitle: "Time blocks and calendar", path: "/schedule", icon: <Calendar className="h-4 w-4" /> },
  { title: "AI", subtitle: "AI assistant", path: "/ai", icon: <Sparkles className="h-4 w-4" /> },
  { title: "Settings", subtitle: "Account and preferences", path: "/settings", icon: <Settings className="h-4 w-4" /> },
  { title: "Portfolios", subtitle: "Group of projects", path: "/portfolios", icon: <Briefcase className="h-4 w-4" /> },
  { title: "Goals", subtitle: "OKRs and goals", path: "/goals", icon: <Target className="h-4 w-4" /> },
  { title: "Reports", subtitle: "Dashboards and metrics", path: "/reports", icon: <BarChart3 className="h-4 w-4" /> },
  { title: "Templates", subtitle: "Project and task templates", path: "/templates", icon: <FileText className="h-4 w-4" /> },
  { title: "Workload", subtitle: "Team capacity", path: "/workload", icon: <LayoutList className="h-4 w-4" /> },
  { title: "Bundles", subtitle: "Reusable packs", path: "/bundles", icon: <Package className="h-4 w-4" /> },
  { title: "Forms", subtitle: "Public intake forms", path: "/forms", icon: <FormInput className="h-4 w-4" /> },
];

// ============ PROVIDER ============

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, close, toggle, isOpen }),
    [open, close, toggle, isOpen],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog open={isOpen} onClose={close} />
    </CommandPaletteContext.Provider>
  );
}

// ============ DIALOG ============

type SearchResult = {
  type: "task" | "project" | "comment" | "client" | "brand";
  id: string;
  title: string;
  subtitle?: string;
  entityId?: string;
};

function CommandPaletteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [serverResults, setServerResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentTasks, setRecentTasks] = useState<RecentEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setServerResults([]);
      setSelectedIndex(0);
      setRecentTasks(readRecentTasks());
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced server fetch
  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) {
      setServerResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=20`,
        );
        if (!cancelled) {
          if (res.ok) {
            const data = (await res.json()) as { results?: SearchResult[] };
            setServerResults(data.results || []);
          } else {
            setServerResults([]);
          }
        }
      } catch {
        if (!cancelled) setServerResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Build grouped items
  const items = useMemo<CommandItem[]>(() => {
    const result: CommandItem[] = [];

    // Actions (hardcoded)
    const actions: CommandItem[] = [
      {
        id: "action:create-task",
        title: "Create task",
        subtitle: "Open the new-task dialog",
        group: "actions",
        icon: <Plus className="h-4 w-4" />,
        onSelect: () => {
          onClose();
          // Broadcast a global event that any CreateTask dialog can hook.
          window.dispatchEvent(new CustomEvent("command-palette:create-task"));
        },
      },
      {
        id: "action:create-project",
        title: "Create project",
        subtitle: "Start a new project",
        group: "actions",
        icon: <FolderOpen className="h-4 w-4" />,
        onSelect: () => {
          onClose();
          router.push("/projects/new");
        },
      },
      {
        id: "action:go-schedule",
        title: "Go to Schedule",
        subtitle: "Time blocks and calendar",
        group: "actions",
        icon: <Calendar className="h-4 w-4" />,
        onSelect: () => {
          onClose();
          router.push("/schedule");
        },
      },
      {
        id: "action:go-settings",
        title: "Go to Settings",
        subtitle: "Account and preferences",
        group: "actions",
        icon: <Settings className="h-4 w-4" />,
        onSelect: () => {
          onClose();
          router.push("/settings");
        },
      },
    ];

    // Pages
    const pages: CommandItem[] = PAGES.map((p) => ({
      id: `page:${p.path}`,
      title: p.title,
      subtitle: p.subtitle,
      group: "pages" as const,
      icon: p.icon,
      onSelect: () => {
        onClose();
        router.push(p.path);
      },
    }));

    // Tasks + projects + clients + brands from server. F-02 extended the
    // server payload to include clients and brands; render those as their own
    // groups so users can hop straight to them.
    const tasks: CommandItem[] = [];
    const projects: CommandItem[] = [];
    const clientItems: CommandItem[] = [];
    const brandItems: CommandItem[] = [];
    for (const r of serverResults) {
      if (r.type === "task") {
        tasks.push({
          id: `task:${r.id}`,
          title: r.title,
          subtitle: r.subtitle,
          group: "tasks",
          icon: <CheckSquare className="h-4 w-4" />,
          onSelect: () => {
            recordRecentTask({ id: r.id, title: r.title, subtitle: r.subtitle });
            onClose();
            router.push(`/tasks/${r.id}`);
          },
        });
      } else if (r.type === "project") {
        projects.push({
          id: `project:${r.id}`,
          title: r.title,
          subtitle: r.subtitle,
          group: "projects",
          icon: <FolderOpen className="h-4 w-4" />,
          onSelect: () => {
            onClose();
            router.push(`/projects/${r.id}`);
          },
        });
      } else if (r.type === "client") {
        clientItems.push({
          id: `client:${r.id}`,
          title: r.title,
          subtitle: r.subtitle,
          group: "clients",
          icon: <Building2 className="h-4 w-4" />,
          onSelect: () => {
            onClose();
            router.push(`/clients/${r.id}`);
          },
        });
      } else if (r.type === "brand") {
        brandItems.push({
          id: `brand:${r.id}`,
          title: r.title,
          subtitle: r.subtitle,
          group: "brands",
          icon: <Megaphone className="h-4 w-4" />,
          onSelect: () => {
            onClose();
            router.push(`/brands/${r.id}`);
          },
        });
      }
    }

    // When no query: show recent tasks as the "tasks" group (bubble to top)
    if (!query.trim()) {
      const recentAsItems: CommandItem[] = recentTasks.map((r) => ({
        id: `task:${r.id}`,
        title: r.title,
        subtitle: r.subtitle ? `${r.subtitle} - recent` : "Recently visited",
        group: "tasks",
        icon: <Clock className="h-4 w-4" />,
        onSelect: () => {
          recordRecentTask({ id: r.id, title: r.title, subtitle: r.subtitle });
          onClose();
          router.push(`/tasks/${r.id}`);
        },
      }));
      result.push(...recentAsItems);
      result.push(...actions);
      result.push(...pages);
      return result;
    }

    // When query present: fuzzy-score the client-side items (actions + pages),
    // and keep server results in their natural relevance order (server already
    // did a LIKE match). Bubble recent tasks to top within the tasks group
    // when they match.
    const q = query.trim();
    const recentIds = new Set(recentTasks.map((r) => r.id));
    tasks.sort((a, b) => {
      const ar = recentIds.has(a.id.replace(/^task:/, "")) ? 1 : 0;
      const br = recentIds.has(b.id.replace(/^task:/, "")) ? 1 : 0;
      return br - ar;
    });

    const filteredActions = actions
      .map((a) => ({
        item: a,
        score: Math.max(
          fuzzyScore(q, a.title),
          a.subtitle ? fuzzyScore(q, a.subtitle) * 0.6 : 0,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);

    const filteredPages = pages
      .map((p) => ({
        item: p,
        score: Math.max(
          fuzzyScore(q, p.title),
          p.subtitle ? fuzzyScore(q, p.subtitle) * 0.6 : 0,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);

    result.push(...tasks);
    result.push(...projects);
    result.push(...clientItems);
    result.push(...brandItems);
    result.push(...filteredActions);
    result.push(...filteredPages);
    return result;
  }, [query, serverResults, recentTasks, router, onClose]);

  // Keep selected index in range
  useEffect(() => {
    if (selectedIndex >= items.length) setSelectedIndex(0);
  }, [items.length, selectedIndex]);

  function onKeyDownInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = items[selectedIndex];
      if (sel) sel.onSelect();
    }
  }

  // Group items for render (preserve internal order within each group)
  const grouped = useMemo(() => {
    const groups: Record<CommandItem["group"], CommandItem[]> = {
      tasks: [],
      projects: [],
      clients: [],
      brands: [],
      actions: [],
      pages: [],
    };
    for (const it of items) groups[it.group].push(it);
    return groups;
  }, [items]);

  // Build a flat list matching render order so keyboard navigation uses
  // the same indices as display
  const flatInRenderOrder = useMemo(() => {
    const order: CommandItem["group"][] = [
      "tasks",
      "projects",
      "clients",
      "brands",
      "actions",
      "pages",
    ];
    const out: CommandItem[] = [];
    for (const g of order) out.push(...grouped[g]);
    return out;
  }, [grouped]);

  useEffect(() => {
    // If render order differs from items order, selectedIndex refers to
    // flatInRenderOrder. Ensure in-range.
    if (selectedIndex >= flatInRenderOrder.length) setSelectedIndex(0);
  }, [flatInRenderOrder.length, selectedIndex]);

  if (!open) return null;

  const groupLabels: Record<CommandItem["group"], string> = {
    tasks: "TASKS",
    projects: "PROJECTS",
    clients: "CLIENTS",
    brands: "BRANDS",
    actions: "ACTIONS",
    pages: "PAGES",
  };

  let runningIndex = 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-popover border rounded-xl shadow-2xl overflow-hidden ring-1 ring-foreground/10">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 border-b">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={onKeyDownInput}
            placeholder="Search tasks, projects, run actions..."
            className="flex-1 py-3 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          {loading && (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          )}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {flatInRenderOrder.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {query.trim().length === 0
                ? "Start typing to search..."
                : "No results"}
            </p>
          )}

          {(
            ["tasks", "projects", "clients", "brands", "actions", "pages"] as CommandItem["group"][]
          ).map((groupKey) => {
            const groupItems = grouped[groupKey];
            if (groupItems.length === 0) return null;
            return (
              <div key={groupKey} className="px-1 py-1">
                <div className="px-3 py-1 text-[10px] font-semibold tracking-widest text-muted-foreground">
                  {groupLabels[groupKey]}
                </div>
                {groupItems.map((item) => {
                  const idx = runningIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={() => item.onSelect()}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-md transition-colors",
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                      type="button"
                    >
                      <span className="text-muted-foreground flex-shrink-0">
                        {item.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{item.title}</p>
                        {item.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            <kbd className="font-mono bg-muted px-1 rounded">{"\u2191\u2193"}</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="font-mono bg-muted px-1 rounded">{"\u23CE"}</kbd>{" "}
            select
          </span>
          <span>
            <kbd className="font-mono bg-muted px-1 rounded">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
