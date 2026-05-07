"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { BUILTIN_TEMPLATES } from "@/lib/project-templates";
import { Sparkles, FolderPlus } from "lucide-react";
import Link from "next/link";

// ─── Starter templates (always visible regardless of user-created templates) ──
const STARTER_TEMPLATES = BUILTIN_TEMPLATES.map((t) => ({
  ...t,
  starter: true as const,
}));

type Template = {
  id: string;
  name: string;
  description: string | null;
  type: "project" | "task";
  content: string;
  category: string | null;
  isPublic: boolean;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
};

type Project = {
  id: string;
  name: string;
  color: string;
};

export default function TemplatesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { error: toastError } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "project" | "task">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<"project" | "task">("project");
  const [formCategory, setFormCategory] = useState("");
  const [formContent, setFormContent] = useState("{}");

  // Instantiation dialogs
  const [instantiateTemplate, setInstantiateTemplate] =
    useState<Template | null>(null);
  const [instantiateName, setInstantiateName] = useState("");
  const [instantiateProjectId, setInstantiateProjectId] = useState("");

  useEffect(() => {
    loadTemplates();
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  function loadTemplates() {
    setLoading(true);
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        setTemplates(data.templates || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormType("project");
    setFormCategory("");
    setFormContent("{}");
    setEditingId(null);
    setShowForm(false);
    setContentError(null);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toastError({ title: "Name required", description: "Give your template a name." });
      return;
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(formContent);
    } catch (err) {
      setContentError(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }
    setContentError(null);

    setSaving(true);
    try {
      const url = editingId ? `/api/templates/${editingId}` : "/api/templates";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          description: formDescription || null,
          type: formType,
          category: formCategory || null,
          content: parsedContent,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toastError({
          title: editingId ? "Couldn't update template" : "Couldn't create template",
          description: err.error || "Please try again.",
        });
        return;
      }

      resetForm();
      loadTemplates();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: "Delete template?",
      description: "Existing projects created from this template keep their content.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    loadTemplates();
  }

  function handleEdit(template: Template) {
    setEditingId(template.id);
    setFormName(template.name);
    setFormDescription(template.description || "");
    setFormType(template.type);
    setFormCategory(template.category || "");
    try {
      const parsed =
        typeof template.content === "string"
          ? template.content
          : JSON.stringify(template.content, null, 2);
      setFormContent(
        typeof template.content === "string"
          ? JSON.stringify(JSON.parse(template.content), null, 2)
          : parsed
      );
    } catch {
      setFormContent(template.content);
    }
    setShowForm(true);
  }

  function handleUseTemplate(template: Template) {
    setInstantiateTemplate(template);
    setInstantiateName(template.name);
    setInstantiateProjectId("");
  }

  async function handleInstantiate() {
    if (!instantiateTemplate) return;

    const body: Record<string, string> = {};
    if (instantiateTemplate.type === "project") {
      if (!instantiateName.trim()) {
        toastError({ title: "Name required", description: "Give the new project a name." });
        return;
      }
      body.name = instantiateName.trim();
    } else {
      if (!instantiateProjectId) {
        toastError({ title: "Project required", description: "Select a project to add the task to." });
        return;
      }
      body.projectId = instantiateProjectId;
    }

    const res = await fetch(`/api/templates/${instantiateTemplate.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      setInstantiateTemplate(null);
      if (data.type === "project" && data.project) {
        router.push(`/projects/${data.project.id}`);
      } else if (data.type === "task" && data.task) {
        router.push(`/tasks/${data.task.id}`);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      toastError({ title: "Couldn't use template", description: err.error || "Please try again." });
    }
  }

  const filtered = templates.filter((t) => {
    if (tab === "all") return true;
    return t.type === tab;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-muted-foreground">
            Reusable project and task templates to speed up your workflow.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          Create Template
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {(["all", "project", "task"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "all"
              ? "All"
              : t === "project"
                ? "Project Templates"
                : "Task Templates"}
          </button>
        ))}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit Template" : "Create Template"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Template name"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Type</label>
                <Select
                  value={formType}
                  onValueChange={(v) => v && setFormType(v as "project" | "task")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {formType === "task" ? "Task" : "Project"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Category</label>
                <Input
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="e.g. Engineering, Marketing"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Content (JSON)</label>
              <textarea
                value={formContent}
                onChange={(e) => {
                  setFormContent(e.target.value);
                  if (contentError) setContentError(null);
                }}
                className="w-full min-h-[120px] rounded-md border bg-transparent px-3 py-2 text-sm font-mono"
                placeholder='{"tasks": [{"title": "Task 1", "priority": "high"}]}'
              />
              {contentError && (
                <p className="text-sm text-red-500">JSON error: {contentError}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Update" : "Save"}
              </Button>
              <Button variant="outline" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instantiation Dialog */}
      {instantiateTemplate && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>
              Use Template: {instantiateTemplate.name}
            </CardTitle>
            <CardDescription>
              {instantiateTemplate.type === "project"
                ? "Create a new project from this template"
                : "Create a new task from this template"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {instantiateTemplate.type === "project" ? (
              <div className="space-y-1">
                <label className="text-sm font-medium">Project Name</label>
                <Input
                  value={instantiateName}
                  onChange={(e) => setInstantiateName(e.target.value)}
                  placeholder="New project name"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-sm font-medium">Add to Project</label>
                <Select
                  value={instantiateProjectId}
                  onValueChange={(v) => v && setInstantiateProjectId(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(() => {
                        const p = projects.find(
                          (p) => p.id === instantiateProjectId
                        );
                        if (!p)
                          return (
                            <span className="text-muted-foreground">
                              Select a project
                            </span>
                          );
                        return (
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                            {p.name}
                          </span>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleInstantiate}>Create</Button>
              <Button
                variant="outline"
                onClick={() => setInstantiateTemplate(null)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Starter templates section — always shown */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-[#2d5200]" />
          <h2 className="text-sm font-bold text-gray-800">Starter Templates</h2>
          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">{STARTER_TEMPLATES.length}</span>
          <p className="text-xs text-gray-500 ml-auto">Pre-built workflows to get you running fast</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {STARTER_TEMPLATES.map((tmpl) => (
            <Link
              key={tmpl.slug}
              href={`/projects/new?template=${tmpl.slug}`}
              className="group p-4 rounded-xl border border-gray-200 hover:border-[#99ff33] hover:shadow-[0_4px_20px_rgb(153_255_51/0.12)] transition-all bg-white block"
            >
              <div className="flex items-start gap-3">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-2xl shadow-sm shrink-0"
                  style={{ backgroundColor: `${tmpl.color}20` }}
                >
                  {tmpl.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 leading-tight">{tmpl.name}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-snug">{tmpl.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <span className="text-[10px] text-gray-400">{tmpl.sections.length} sections</span>
                <span className="ml-auto text-[10px] text-[#2d5200] font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <FolderPlus size={10} /> Use template →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* User's saved templates */}
      {loading ? (
        <p className="text-muted-foreground">Loading templates...</p>
      ) : filtered.length === 0 ? (
        // F-61: explicit dark mode background + text colors so the empty
        // state isn't light grey on a dark canvas.
        <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 bg-gray-50/40 dark:bg-white/[0.02] p-6 text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">No saved templates yet</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Pick a starter above, or click <span className="font-semibold">+ New Template</span> to create your own.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => (
            <Card key={template.id} className="group relative">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  <Badge variant={template.type === "project" ? "default" : "secondary"}>
                    {template.type}
                  </Badge>
                </div>
                {template.description && (
                  <CardDescription>{template.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  {template.category && (
                    <Badge variant="outline" className="text-xs">
                      {template.category}
                    </Badge>
                  )}
                  {template.createdBy && (
                    <span>by {template.createdBy.name}</span>
                  )}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    onClick={() => handleUseTemplate(template)}
                  >
                    Use Template
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(template)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(template.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
