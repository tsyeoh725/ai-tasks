"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type Bundle = {
  id: string;
  name: string;
  description: string | null;
  manifest: string;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
};

type Project = {
  id: string;
  name: string;
  color: string;
};

type AutomationRule = {
  id: string;
  name: string;
  description: string | null;
  trigger: unknown;
  actions: unknown;
  enabled: boolean;
};

type CustomField = {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "select" | "multi_select";
  options: string | null;
  required: boolean;
  position: number;
};

type Section = {
  id: string;
  name: string;
  sortOrder: number;
};

export default function BundlesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [applying, setApplying] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Capture form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [captureProjectId, setCaptureProjectId] = useState("");
  const [capturingData, setCapturingData] = useState(false);

  // Apply form
  const [applyProjectId, setApplyProjectId] = useState("");
  const [applyingData, setApplyingData] = useState(false);

  useEffect(() => {
    load();
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  function load() {
    setLoading(true);
    fetch("/api/bundles")
      .then((r) => r.json())
      .then((data) => {
        setBundles(data.bundles || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  async function captureFromProject() {
    setError(null);
    setInfo(null);
    if (!captureProjectId) {
      setError("Please select a source project");
      return;
    }
    if (!newName.trim()) {
      setError("Please provide a bundle name");
      return;
    }
    setCapturingData(true);

    try {
      // Pull sections, custom fields, automation rules from the project
      const [sectionsRes, fieldsRes, rulesRes] = await Promise.all([
        fetch(`/api/projects/${captureProjectId}/sections`),
        fetch(`/api/projects/${captureProjectId}/custom-fields`),
        fetch(`/api/automations?projectId=${captureProjectId}`),
      ]);

      if (!sectionsRes.ok || !fieldsRes.ok || !rulesRes.ok) {
        throw new Error("Failed to load project data");
      }

      const sectionsData = await sectionsRes.json();
      const fieldsData = await fieldsRes.json();
      const rulesData = await rulesRes.json();

      const sections: Section[] = sectionsData.sections || [];
      const customFields: CustomField[] = fieldsData.fields || [];
      const rules: AutomationRule[] = rulesData.rules || [];

      const manifest = {
        sections: sections.map((s) => ({
          name: s.name,
          sortOrder: s.sortOrder,
        })),
        customFields: customFields.map((f) => ({
          name: f.name,
          type: f.type,
          options: f.options
            ? (() => {
                try {
                  return JSON.parse(f.options);
                } catch {
                  return null;
                }
              })()
            : null,
          required: f.required,
          position: f.position,
        })),
        rules: rules.map((r) => ({
          name: r.name,
          description: r.description,
          trigger: r.trigger,
          actions: r.actions,
          enabled: r.enabled,
        })),
        views: [],
      };

      if (
        manifest.sections.length === 0 &&
        manifest.customFields.length === 0 &&
        manifest.rules.length === 0
      ) {
        setError(
          "Source project has no sections, custom fields, or automation rules to capture."
        );
        setCapturingData(false);
        return;
      }

      const res = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          manifest,
        }),
      });

      if (res.ok) {
        setInfo(
          `Bundle created: captured ${manifest.sections.length} sections, ${manifest.customFields.length} custom fields, ${manifest.rules.length} rules.`
        );
        setCapturing(false);
        setNewName("");
        setNewDescription("");
        setCaptureProjectId("");
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to create bundle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to capture bundle");
    } finally {
      setCapturingData(false);
    }
  }

  async function applyBundle() {
    setError(null);
    setInfo(null);
    if (!applying) return;
    if (!applyProjectId) {
      setError("Please select a target project");
      return;
    }
    setApplyingData(true);
    try {
      const res = await fetch(`/api/bundles/${applying.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: applyProjectId }),
      });
      if (res.ok) {
        const data = await res.json();
        const targetId = applyProjectId;
        setApplying(null);
        setApplyProjectId("");
        setInfo(
          `Applied! Created ${data.created.sections} sections, ${data.created.customFields} custom fields, ${data.created.rules} rules.`
        );
        router.push(`/projects/${targetId}`);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to apply bundle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply bundle");
    } finally {
      setApplyingData(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: "Delete bundle?",
      description: "This removes the reusable package. Projects it's already applied to are unaffected.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/bundles/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Failed to delete bundle");
      return;
    }
    load();
  }

  function summarizeManifest(raw: string) {
    try {
      const m = JSON.parse(raw);
      const counts = {
        sections: Array.isArray(m.sections) ? m.sections.length : 0,
        customFields: Array.isArray(m.customFields) ? m.customFields.length : 0,
        rules: Array.isArray(m.rules) ? m.rules.length : 0,
      };
      return counts;
    } catch {
      return { sections: 0, customFields: 0, rules: 0 };
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bundles</h1>
          <p className="text-muted-foreground">
            Reusable packages of sections, custom fields, and automation rules.
          </p>
        </div>
        <Button onClick={() => setCapturing(true)}>Create from project</Button>
      </div>

      {error && (
        <div className="border border-destructive/40 bg-destructive/10 text-destructive text-sm rounded-md p-3 flex items-start justify-between gap-2">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-xs opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            {"\u2715"}
          </button>
        </div>
      )}

      {info && (
        <div className="border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300 text-sm rounded-md p-3 flex items-start justify-between gap-2">
          <span>{info}</span>
          <button
            onClick={() => setInfo(null)}
            className="text-xs opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            {"\u2715"}
          </button>
        </div>
      )}

      {capturing && (
        <Card>
          <CardHeader>
            <CardTitle>Capture bundle from project</CardTitle>
            <CardDescription>
              Snapshots the project&apos;s rules, custom fields, and sections
              into a reusable manifest.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Bundle name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Source project</label>
              <Select
                value={captureProjectId}
                onValueChange={(v) => v && setCaptureProjectId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(() => {
                      const p = projects.find(
                        (p) => p.id === captureProjectId
                      );
                      if (!p)
                        return (
                          <span className="text-muted-foreground">
                            Pick a project
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
            <div className="flex gap-2">
              <Button
                onClick={captureFromProject}
                disabled={
                  capturingData || !captureProjectId || !newName.trim()
                }
              >
                {capturingData ? "Capturing..." : "Capture"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCapturing(false);
                  setError(null);
                }}
                disabled={capturingData}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {applying && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Apply: {applying.name}</CardTitle>
            <CardDescription>
              Select a project to apply this bundle to. Sections, custom
              fields, and automation rules will be appended.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Target project</label>
              <Select
                value={applyProjectId}
                onValueChange={(v) => v && setApplyProjectId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(() => {
                      const p = projects.find((p) => p.id === applyProjectId);
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
            <div className="flex gap-2">
              <Button
                onClick={applyBundle}
                disabled={applyingData || !applyProjectId}
              >
                {applyingData ? "Applying..." : "Apply"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setApplying(null);
                  setError(null);
                }}
                disabled={applyingData}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading bundles...</p>
      ) : bundles.length === 0 ? (
        <p className="text-muted-foreground">
          No bundles yet. Create one from a project to reuse its setup.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bundles.map((bundle) => {
            const counts = summarizeManifest(bundle.manifest);
            return (
              <Card key={bundle.id} className="group relative">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{bundle.name}</CardTitle>
                    {bundle.team ? (
                      <Badge variant="secondary">{bundle.team.name}</Badge>
                    ) : (
                      <Badge variant="outline">Personal</Badge>
                    )}
                  </div>
                  {bundle.description && (
                    <CardDescription>{bundle.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
                    <Badge variant="outline">
                      {counts.sections} sections
                    </Badge>
                    <Badge variant="outline">
                      {counts.customFields} custom fields
                    </Badge>
                    <Badge variant="outline">{counts.rules} rules</Badge>
                  </div>
                  {bundle.createdBy && (
                    <p className="text-xs text-muted-foreground">
                      by {bundle.createdBy.name}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setApplying(bundle)}>
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(bundle.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
