"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Form = {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  project: { id: string; name: string; color: string } | null;
  createdBy: { id: string; name: string } | null;
};

type Project = {
  id: string;
  name: string;
};

export default function FormsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { error: toastError } = useToast();
  const [forms, setForms] = useState<Form[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newProjectId, setNewProjectId] = useState("");

  const loadForms = useCallback(() => {
    setLoading(true);
    fetch("/api/forms")
      .then((r) => r.json())
      .then((data) => {
        setForms(data.forms || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount; not migrating to Suspense
    loadForms();
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, [loadForms]);

  async function handleCreate() {
    if (!newTitle.trim() || !newProjectId) {
      toastError({ title: "Missing info", description: "Title and project are required." });
      return;
    }
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription || null,
          projectId: newProjectId,
          isPublic: true,
          fields: [],
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setCreating(false);
        setNewTitle("");
        setNewDescription("");
        setNewProjectId("");
        router.push(`/forms/${created.id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        toastError({ title: "Couldn't create form", description: err.error || "Please try again." });
      }
    } catch {
      toastError({ title: "Couldn't create form", description: "Network error. Please try again." });
    }
  }

  async function handleDelete(id: string, title: string) {
    const ok = await confirm({
      title: "Delete form?",
      description: `"${title}" and all its submissions will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/forms/${id}`, { method: "DELETE" });
    loadForms();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Forms</h1>
          <p className="text-muted-foreground">
            Collect task requests from a shareable public URL.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>+ New form</Button>
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Create form</CardTitle>
            <CardDescription>
              Submissions from this form become tasks in the selected project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Bug report, Feature request, etc."
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description shown on the public form"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Project</label>
              <Select
                value={newProjectId}
                onValueChange={(v) => v && setNewProjectId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a project">
                    {projects.find((p) => p.id === newProjectId)?.name ??
                      "Select a project"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate}>Create</Button>
              <Button variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading forms...</p>
      ) : forms.length === 0 ? (
        <p className="text-muted-foreground">
          No forms yet. Create one to collect task requests from anywhere.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map((form) => (
            <Card key={form.id} className="group relative">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{form.title}</CardTitle>
                  <Badge variant={form.isPublic ? "default" : "secondary"}>
                    {form.isPublic ? "Public" : "Private"}
                  </Badge>
                </div>
                {form.description && (
                  <CardDescription>{form.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {form.project && (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: form.project.color }}
                      />
                      {form.project.name}
                    </span>
                  )}
                  {form.createdBy && <span>by {form.createdBy.name}</span>}
                </div>
                <div className="flex gap-2">
                  <Link href={`/forms/${form.id}`}>
                    <Button size="sm">Open builder</Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(form.id, form.title)}
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
