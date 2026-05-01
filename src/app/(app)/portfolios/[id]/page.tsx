"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

const COLOR_OPTIONS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

const STATUS_CONFIG = {
  on_track: { label: "On Track", color: "#22c55e" },
  at_risk: { label: "At Risk", color: "#eab308" },
  off_track: { label: "Off Track", color: "#ef4444" },
  complete: { label: "Complete", color: "#3b82f6" },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;

type PortfolioProject = {
  id: string;
  portfolioId: string;
  projectId: string;
  status: StatusKey;
  statusNote: string | null;
  project: {
    id: string;
    name: string;
    color: string;
  };
  taskCount: number;
  doneCount: number;
};

type Portfolio = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  projects: PortfolioProject[];
};

type UserProject = {
  id: string;
  name: string;
  color: string;
};

export default function PortfolioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const confirm = useConfirm();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<UserProject[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("#6366f1");
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch(`/api/portfolios/${id}`);
      if (!res.ok) {
        router.push("/portfolios");
        return;
      }
      const data = await res.json();
      setPortfolio(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setAvailableProjects(data.projects || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  async function handleAddProject(projectId: string) {
    const res = await fetch(`/api/portfolios/${id}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });

    if (res.ok) {
      setAdding(false);
      setSearchQuery("");
      fetchPortfolio();
    }
  }

  async function handleStatusChange(projectId: string, status: string) {
    await fetch(`/api/portfolios/${id}/projects`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, status }),
    });
    fetchPortfolio();
  }

  async function handleStatusNoteSave(projectId: string) {
    await fetch(`/api/portfolios/${id}/projects`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, statusNote: noteDraft }),
    });
    setEditingNoteFor(null);
    setNoteDraft("");
    fetchPortfolio();
  }

  async function handleRemoveProject(projectId: string, projectName: string) {
    const ok = await confirm({
      title: "Remove project from portfolio?",
      description: `"${projectName}" will no longer appear here. The project itself is untouched.`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/portfolios/${id}/projects`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    fetchPortfolio();
  }

  function openEdit() {
    if (!portfolio) return;
    setEditName(portfolio.name);
    setEditDescription(portfolio.description ?? "");
    setEditColor(portfolio.color);
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!portfolio || !editName.trim()) return;
    const res = await fetch(`/api/portfolios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        description: editDescription.trim() || null,
        color: editColor,
      }),
    });
    if (res.ok) {
      setEditOpen(false);
      fetchPortfolio();
    }
  }

  async function handleDeletePortfolio() {
    if (!portfolio) return;
    const ok = await confirm({
      title: "Delete portfolio?",
      description: `"${portfolio.name}" will be removed. The projects inside it are not deleted.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch(`/api/portfolios/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/portfolios");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!portfolio) return null;

  const existingProjectIds = new Set(
    portfolio.projects.map((pp) => pp.projectId)
  );
  const filteredProjects = availableProjects.filter(
    (p) =>
      !existingProjectIds.has(p.id) &&
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="w-4 h-4 rounded-full mt-1 shrink-0"
            style={{ backgroundColor: portfolio.color }}
          />
          <div>
            <h1 className="text-2xl font-bold">{portfolio.name}</h1>
            {portfolio.description && (
              <p className="text-muted-foreground mt-1">
                {portfolio.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Portfolio actions" />}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openEdit}>
                <Pencil className="h-4 w-4" />
                Edit portfolio
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDeletePortfolio}>
                <Trash2 className="h-4 w-4" />
                Delete portfolio
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/portfolios")}
          >
            Back
          </Button>
        </div>
      </div>

      {/* Add Project */}
      <div>
        {!adding ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAdding(true);
              fetchProjects();
            }}
          >
            <svg
              className="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Project
          </Button>
        ) : (
          <div className="border rounded-lg p-3 space-y-2 max-w-sm">
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 px-1">
                  No projects available
                </p>
              ) : (
                filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent flex items-center gap-2"
                    onClick={() => handleAddProject(project.id)}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    {project.name}
                  </button>
                ))
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setSearchQuery("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Projects Table */}
      {portfolio.projects.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">
            No projects in this portfolio yet. Add one to get started.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Project Name</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-center p-3 font-medium">Tasks</th>
                <th className="text-center p-3 font-medium">Completion</th>
                <th className="text-left p-3 font-medium">Status Note</th>
                <th className="w-10 p-3" />
              </tr>
            </thead>
            <tbody>
              {portfolio.projects.map((pp) => {
                const completion =
                  pp.taskCount > 0
                    ? Math.round((pp.doneCount / pp.taskCount) * 100)
                    : 0;
                const statusInfo = STATUS_CONFIG[pp.status];
                const isEditingNote = editingNoteFor === pp.projectId;

                return (
                  <tr
                    key={pp.id}
                    className="border-b last:border-b-0 hover:bg-accent/30"
                    onMouseEnter={() => setHoveredRow(pp.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td className="p-3">
                      <Link
                        href={`/projects/${pp.projectId}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: pp.project.color }}
                        />
                        <span className="font-medium">{pp.project.name}</span>
                      </Link>
                    </td>
                    <td className="p-3">
                      <Select
                        value={pp.status}
                        onValueChange={(v) =>
                          v && handleStatusChange(pp.projectId, v)
                        }
                      >
                        <SelectTrigger size="sm" className="w-32">
                          <SelectValue>
                            <span className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{ backgroundColor: statusInfo.color }}
                              />
                              {statusInfo.label}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.entries(STATUS_CONFIG) as [
                              StatusKey,
                              (typeof STATUS_CONFIG)[StatusKey]
                            ][]
                          ).map(([key, cfg]) => (
                            <SelectItem key={key} value={key}>
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full inline-block"
                                  style={{ backgroundColor: cfg.color }}
                                />
                                {cfg.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-center text-muted-foreground">
                      {pp.taskCount}
                    </td>
                    <td
                      className="p-3 text-center"
                      title={`${pp.doneCount} of ${pp.taskCount} ${pp.taskCount === 1 ? "task" : "tasks"} complete`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${completion}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">
                          {completion}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      {isEditingNote ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleStatusNoteSave(pp.projectId);
                              } else if (e.key === "Escape") {
                                setEditingNoteFor(null);
                                setNoteDraft("");
                              }
                            }}
                            onBlur={() => handleStatusNoteSave(pp.projectId)}
                            placeholder="Add a status note..."
                            className="h-7 text-xs"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button
                          className="text-left text-muted-foreground hover:text-foreground hover:bg-accent/50 px-2 py-1 -mx-2 -my-1 rounded cursor-text w-full"
                          onClick={() => {
                            setEditingNoteFor(pp.projectId);
                            setNoteDraft(pp.statusNote ?? "");
                          }}
                        >
                          {pp.statusNote || (
                            <span className="italic opacity-60">Add note…</span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="p-3">
                      {hoveredRow === pp.id && (
                        <button
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() =>
                            handleRemoveProject(pp.projectId, pp.project.name)
                          }
                          title="Remove from portfolio"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit portfolio</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Portfolio name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      editColor === c
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setEditColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveEdit}
              disabled={!editName.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
