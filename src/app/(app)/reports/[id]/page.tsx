"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  ReportWidget,
  type Widget,
  type WidgetType,
  type WidgetSource,
  type WidgetAggregation,
} from "@/components/report-widget";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Report = {
  id: string;
  name: string;
  description: string | null;
  layout: string;
  ownerId: string;
};

// Tailwind needs static class strings in source for JIT to pick up.
// On mobile the grid is 1-col so every widget fills the row; from sm:2-col
// and md:4-col we honor the configured width.
const COL_SPAN: Record<number, string> = {
  1: "col-span-1 sm:col-span-1 md:col-span-1",
  2: "col-span-1 sm:col-span-2 md:col-span-2",
  3: "col-span-1 sm:col-span-2 md:col-span-3",
  4: "col-span-1 sm:col-span-2 md:col-span-4",
};

const ROW_SPAN: Record<number, string> = {
  1: "row-span-1",
  2: "row-span-2",
  3: "row-span-3",
  4: "row-span-4",
};

const WIDGET_TYPES: { value: WidgetType; label: string }[] = [
  { value: "column", label: "Column" },
  { value: "line", label: "Line" },
  { value: "donut", label: "Donut" },
  { value: "number", label: "Number" },
  { value: "lollipop", label: "Lollipop" },
  { value: "burnup", label: "Burnup" },
];

const WIDGET_SOURCES: { value: WidgetSource; label: string }[] = [
  { value: "tasks", label: "Tasks" },
  { value: "projects", label: "Projects" },
  { value: "portfolios", label: "Portfolios" },
  { value: "goals", label: "Goals" },
];

const AGGREGATIONS: { value: WidgetAggregation; label: string }[] = [
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
];

// Per-source group-by suggestions.
const GROUP_BY_OPTIONS: Record<WidgetSource, string[]> = {
  tasks: ["status", "priority", "taskType", "projectId", "assigneeId"],
  projects: ["teamId", "ownerId", "color"],
  portfolios: ["teamId", "ownerId", "color"],
  goals: ["status", "type", "teamId", "ownerId"],
};

function parseLayout(raw: string): Widget[] {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr as Widget[];
  } catch {
    // ignore
  }
  return [];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const confirm = useConfirm();

  const [report, setReport] = useState<Report | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/${id}`);
      if (!res.ok) {
        router.push("/reports");
        return;
      }
      const data: Report = await res.json();
      setReport(data);
      setTitleDraft(data.name);
      setWidgets(parseLayout(data.layout));
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  async function persistLayout(next: Widget[]) {
    setWidgets(next);
    await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: next }),
    });
  }

  async function persistName(name: string) {
    if (!report) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === report.name) {
      setTitleDraft(report.name);
      setEditingTitle(false);
      return;
    }
    await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setReport({ ...report, name: trimmed });
    setEditingTitle(false);
  }

  function openNewWidget() {
    const draft: Widget = {
      id: uuid(),
      type: "column",
      source: "tasks",
      title: "New widget",
      aggregation: "count",
      groupBy: "status",
      width: 2,
      height: 2,
    };
    setEditingWidget(draft);
    setEditorOpen(true);
  }

  function openEditWidget(widget: Widget) {
    setEditingWidget({ ...widget });
    setEditorOpen(true);
  }

  async function saveWidget() {
    if (!editingWidget) return;

    const normalized: Widget = {
      ...editingWidget,
      width: clamp(editingWidget.width || 2, 1, 4),
      height: clamp(editingWidget.height || 2, 1, 4),
      title: editingWidget.title.trim() || "Untitled widget",
    };

    const exists = widgets.some((w) => w.id === normalized.id);
    const next = exists
      ? widgets.map((w) => (w.id === normalized.id ? normalized : w))
      : [...widgets, normalized];

    await persistLayout(next);
    setEditorOpen(false);
    setEditingWidget(null);
  }

  async function deleteWidget() {
    if (!editingWidget) return;
    const next = widgets.filter((w) => w.id !== editingWidget.id);
    await persistLayout(next);
    setEditorOpen(false);
    setEditingWidget(null);
  }

  async function handleDeleteReport() {
    const ok = await confirm({
      title: "Delete report?",
      description: `"${report?.name}" and all its widgets will be removed. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/reports");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => persistName(titleDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  persistName(titleDraft);
                } else if (e.key === "Escape") {
                  setTitleDraft(report.name);
                  setEditingTitle(false);
                }
              }}
              className="text-2xl font-bold h-auto py-1"
              autoFocus
            />
          ) : (
            <h1
              className="text-2xl font-bold cursor-text hover:bg-accent/50 px-1 -mx-1 rounded"
              onClick={() => setEditingTitle(true)}
            >
              {report.name}
            </h1>
          )}
          {report.description && (
            <p className="text-muted-foreground text-sm mt-1">
              {report.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button onClick={openNewWidget}>
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
            Add widget
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/reports")}
          >
            Back
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteReport}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Grid */}
      {widgets.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-4">
            No widgets yet. Add one to start visualizing your data.
          </p>
          <Button onClick={openNewWidget}>Add widget</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 auto-rows-[180px]">
          {widgets.map((w) => {
            const col = COL_SPAN[clamp(w.width, 1, 4)];
            const row = ROW_SPAN[clamp(w.height, 1, 4)];
            return (
              <div key={w.id} className={`${col} ${row}`}>
                <ReportWidget
                  reportId={id}
                  widget={w}
                  onEdit={openEditWidget}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Widget editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingWidget && widgets.some((w) => w.id === editingWidget.id)
                ? "Edit widget"
                : "Add widget"}
            </DialogTitle>
          </DialogHeader>
          {editingWidget && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="widget-title">Title</Label>
                <Input
                  id="widget-title"
                  value={editingWidget.title}
                  onChange={(e) =>
                    setEditingWidget({ ...editingWidget, title: e.target.value })
                  }
                  placeholder="Widget title"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={editingWidget.type}
                    onValueChange={(v) =>
                      v &&
                      setEditingWidget({
                        ...editingWidget,
                        type: v as WidgetType,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WIDGET_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select
                    value={editingWidget.source}
                    onValueChange={(v) =>
                      v &&
                      setEditingWidget({
                        ...editingWidget,
                        source: v as WidgetSource,
                        groupBy: GROUP_BY_OPTIONS[v as WidgetSource][0],
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WIDGET_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Aggregation</Label>
                  <Select
                    value={editingWidget.aggregation}
                    onValueChange={(v) =>
                      v &&
                      setEditingWidget({
                        ...editingWidget,
                        aggregation: v as WidgetAggregation,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGGREGATIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {editingWidget.type !== "number" &&
                  editingWidget.type !== "burnup" && (
                    <div className="space-y-2">
                      <Label>Group by</Label>
                      <Select
                        value={editingWidget.groupBy || ""}
                        onValueChange={(v) =>
                          v &&
                          setEditingWidget({ ...editingWidget, groupBy: v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Field" />
                        </SelectTrigger>
                        <SelectContent>
                          {GROUP_BY_OPTIONS[editingWidget.source].map(
                            (field) => (
                              <SelectItem key={field} value={field}>
                                {field}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
              </div>

              {editingWidget.aggregation !== "count" && (
                <div className="space-y-2">
                  <Label htmlFor="widget-yaxis">Numeric field</Label>
                  <Input
                    id="widget-yaxis"
                    value={editingWidget.yAxis || ""}
                    onChange={(e) =>
                      setEditingWidget({
                        ...editingWidget,
                        yAxis: e.target.value,
                      })
                    }
                    placeholder="e.g. estimatedHours, progress"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="widget-width">Width (1-4)</Label>
                  <Input
                    id="widget-width"
                    type="number"
                    min={1}
                    max={4}
                    value={editingWidget.width}
                    onChange={(e) =>
                      setEditingWidget({
                        ...editingWidget,
                        width: clamp(Number(e.target.value) || 1, 1, 4),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="widget-height">Height (1-4)</Label>
                  <Input
                    id="widget-height"
                    type="number"
                    min={1}
                    max={4}
                    value={editingWidget.height}
                    onChange={(e) =>
                      setEditingWidget({
                        ...editingWidget,
                        height: clamp(Number(e.target.value) || 1, 1, 4),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {editingWidget &&
              widgets.some((w) => w.id === editingWidget.id) && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={deleteWidget}
                  className="mr-auto"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveWidget}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
