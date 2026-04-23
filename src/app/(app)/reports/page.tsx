"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { v4 as uuid } from "uuid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_TEMPLATES } from "@/lib/report-templates";

type Report = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  createdAt: string;
};

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [templateLoading, setTemplateLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchReports() {
    try {
      const res = await fetch("/api/reports");
      const data = await res.json();
      setReports(data.reports || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReports();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      if (res.ok) {
        const report = await res.json();
        router.push(`/reports/${report.id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to create report");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUseTemplate(templateId: string) {
    const template = REPORT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setTemplateLoading(templateId);
    setError(null);
    try {
      // Clone widgets with fresh IDs so each instantiated report has unique widget ids.
      const layout = template.widgets.map((w) => ({ ...w, id: uuid() }));
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          layout,
        }),
      });
      if (res.ok) {
        const report = await res.json();
        router.push(`/reports/${report.id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to create report from template");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create report");
    } finally {
      setTemplateLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm">
            Universal reporting across tasks, projects, portfolios, and goals
          </p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <svg
              className="h-4 w-4 mr-2"
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
            New report
          </Button>
        )}
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

      {/* Templates */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Use a template
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Start from a prebuilt layout and customize from there.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {REPORT_TEMPLATES.map((template) => (
            <Card key={template.id} className="flex flex-col">
              <CardContent className="p-4 flex-1 flex flex-col">
                <div className="flex items-start gap-3 mb-2">
                  <div className="text-2xl leading-none" aria-hidden>
                    {template.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                      {template.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {template.description}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  {template.widgets.length} widget
                  {template.widgets.length === 1 ? "" : "s"}
                </div>
                <div className="mt-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => handleUseTemplate(template.id)}
                    disabled={templateLoading !== null}
                  >
                    {templateLoading === template.id
                      ? "Creating..."
                      : "Use template"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Create report</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-name">Name</Label>
                <Input
                  id="report-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q2 team overview"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-desc">Description (optional)</Label>
                <Textarea
                  id="report-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this report cover?"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!name.trim() || submitting}>
                  {submitting ? "Creating..." : "Create"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setCreating(false);
                    setName("");
                    setDescription("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Your reports
        </h2>
        {reports.length === 0 && !creating ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground mb-4">
                No reports yet. Create one to start tracking metrics across your
                work.
              </p>
              <Button onClick={() => setCreating(true)}>
                Create your first report
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => (
              <Card
                key={report.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => router.push(`/reports/${report.id}`)}
              >
                <CardContent className="p-5">
                  <h3 className="font-semibold truncate">{report.name}</h3>
                  {report.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {report.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-3">
                    Updated{" "}
                    {formatDistanceToNow(new Date(report.updatedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
