"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { CreateClientDialog } from "@/components/create-client-dialog";
import { BUILTIN_TEMPLATES } from "@/lib/project-templates";

const COLOR_OPTIONS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#99ff33", "#3b82f6", "#14b8a6", "#f43f5e",
];

const ICON_OPTIONS = [
  "📁", "🚀", "💡", "🎯", "📊", "🔧", "✨", "🌟",
  "📱", "🎨", "💼", "🔍", "📝", "🤝", "🏆", "⚡",
];

const CATEGORIES = [
  { value: "campaign_client", label: "Campaign" },
  { value: "retainer_social", label: "Social Media Retainer" },
  { value: "retainer_seo", label: "SEO Retainer" },
  { value: "retainer_performance", label: "Performance Marketing" },
  { value: "retainer_content", label: "Content Retainer" },
  { value: "one_time", label: "One-time Project" },
  { value: "branding", label: "Branding" },
  { value: "web", label: "Website" },
  { value: "internal", label: "Internal" },
];

type ClientOption = { id: string; name: string; brandColor?: string };
type GoalOption = { id: string; title: string };

type Props = {
  onCreated?: (project: { id: string; name: string }) => void;
  trigger?: React.ReactNode;
  defaultClientId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CreateProjectDialog({ onCreated, trigger, defaultClientId, open: openProp, onOpenChange }: Props) {
  const { success, error } = useToast();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [saving, setSaving] = useState(false);

  // Fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState(defaultClientId || "");
  const [color, setColor] = useState("#6366f1");
  const [icon, setIcon] = useState("");
  const [category, setCategory] = useState("");
  const [campaign, setCampaign] = useState("");
  const [templateSlug, setTemplateSlug] = useState("");
  const [budget, setBudget] = useState("");
  const [linkedGoalIds, setLinkedGoalIds] = useState<string[]>([]);
  const [newClientOpen, setNewClientOpen] = useState(false);

  // Data
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [goals, setGoals] = useState<GoalOption[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/clients").then((r) => r.json()).then((d) => setClients(d.clients || d || [])).catch(() => {});
    fetch("/api/goals").then((r) => r.json()).then((d) => setGoals(d.goals || [])).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (defaultClientId) setClientId(defaultClientId);
  }, [defaultClientId]);

  function reset() {
    setName(""); setDescription(""); setClientId(defaultClientId || "");
    setColor("#6366f1"); setIcon(""); setCategory(""); setCampaign("");
    setTemplateSlug(""); setBudget(""); setLinkedGoalIds([]);
  }

  function handleTemplateSelect(slug: string) {
    setTemplateSlug(slug);
    if (!slug) return;
    const tmpl = BUILTIN_TEMPLATES.find((t) => t.slug === slug);
    if (tmpl) {
      if (!color || color === "#6366f1") setColor(tmpl.color);
      if (!icon) setIcon(tmpl.icon);
      if (!category) setCategory(tmpl.category);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        clientId: clientId || null,
        color,
        icon: icon || null,
        category: category || null,
        campaign: campaign.trim() || null,
        templateSlug: templateSlug || null,
      };

      // Store budget in customFields via the project API
      if (budget) body.budget = parseFloat(budget);

      // Link goals after creation
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        error({ title: data.error || "Failed to create project" });
        return;
      }

      const created = await res.json();

      // Link goals if any selected
      if (linkedGoalIds.length > 0 && created?.id) {
        await Promise.all(
          linkedGoalIds.map((goalId) =>
            fetch(`/api/goals/${goalId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ linkedProjectId: created.id }),
            })
          )
        );
      }

      success({ title: `Project "${name}" created` });
      onCreated?.(created);
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        {!isControlled && (
          <DialogTrigger
            render={trigger
              ? (props) => React.cloneElement(trigger as React.ReactElement, props)
              : <Button size="sm" className="btn-brand gap-1.5" />
            }
          >
            {!trigger && <><Plus size={14} /> New Project</>}
          </DialogTrigger>
        )}
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pb-2">

            {/* Template */}
            <div className="space-y-1.5">
              <Label>Start from Template <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => handleTemplateSelect("")}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                    !templateSlug
                      ? "border-[#99ff33] bg-[#99ff33]/10"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="text-base mb-0.5">📋</div>
                  <div className="font-medium">Blank project</div>
                  <div className="text-muted-foreground">Start from scratch</div>
                </button>
                {BUILTIN_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.slug}
                    type="button"
                    onClick={() => handleTemplateSelect(tmpl.slug)}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                      templateSlug === tmpl.slug
                        ? "border-[#99ff33] bg-[#99ff33]/10"
                        : "border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    <div className="text-base mb-0.5">{tmpl.icon}</div>
                    <div className="font-medium">{tmpl.name}</div>
                    <div className="text-muted-foreground truncate">{tmpl.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Project Name <span className="text-red-500">*</span></Label>
              <Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Q3 Social Media Campaign" />
            </div>

            {/* Client */}
            <div className="space-y-1.5">
              <Label>Client</Label>
              <div className="flex gap-2">
                <Select value={clientId || "none"} onValueChange={(v) => v != null && setClientId(v === "none" ? "" : v)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="No client">
                      {selectedClient ? (
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: selectedClient.brandColor || "#99ff33" }}
                          />
                          {selectedClient.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No client</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none"><span className="text-muted-foreground">No client</span></SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.brandColor || "#99ff33" }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1 text-xs"
                  onClick={() => setNewClientOpen(true)}
                >
                  <Plus size={12} /> Client
                </Button>
              </div>
            </div>

            {/* Category & Campaign */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category || "none"} onValueChange={(v) => v != null && setCategory(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none"><span className="text-muted-foreground">None</span></SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-budget">Budget (MYR)</Label>
                <Input
                  id="proj-budget"
                  type="number"
                  min="0"
                  step="500"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="e.g. 15000"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="proj-desc">Description</Label>
              <Textarea id="proj-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Goals, scope, deliverables..." rows={2} />
            </div>

            {/* Color & Icon */}
            <div className="space-y-1.5">
              <Label>Color &amp; Icon</Label>
              <div className="flex items-center gap-4">
                <div className="flex gap-1.5 flex-wrap">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ backgroundColor: c, borderColor: color === c ? "#000" : "transparent" }}
                    />
                  ))}
                </div>
                <div className="w-px h-6 bg-border" />
                <div className="flex gap-1.5 flex-wrap">
                  {ICON_OPTIONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(icon === ic ? "" : ic)}
                      className={`h-7 w-7 rounded text-sm flex items-center justify-center transition-all ${
                        icon === ic ? "bg-[#99ff33]/20 ring-1 ring-[#99ff33]" : "hover:bg-muted"
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Link Goals */}
            {goals.length > 0 && (
              <div className="space-y-1.5">
                <Label>Link to Goals <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                <div className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2">
                  {goals.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={linkedGoalIds.includes(g.id)}
                        onChange={(e) => {
                          if (e.target.checked) setLinkedGoalIds((prev) => [...prev, g.id]);
                          else setLinkedGoalIds((prev) => prev.filter((id) => id !== g.id));
                        }}
                        className="rounded"
                      />
                      <span className="truncate">{g.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <Button type="submit" className="w-full btn-brand" disabled={saving || !name.trim()}>
              {saving ? "Creating…" : "Create Project"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inline new client dialog triggered from this form */}
      <CreateClientDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        onCreated={(client) => {
          setClients((prev) => [...prev, client]);
          setClientId(client.id);
        }}
      />
    </>
  );
}
