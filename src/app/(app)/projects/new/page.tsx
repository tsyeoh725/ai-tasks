"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Megaphone, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BUILTIN_TEMPLATES } from "@/lib/project-templates";
import { IconColorPicker, ProjectColorDot, COLOR_PALETTE } from "@/components/icon-color-picker";

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTemplate = searchParams?.get("template") ?? null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#99ff33");
  const [icon, setIcon] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [campaign, setCampaign] = useState("");
  const [templateSlug, setTemplateSlug] = useState<string | null>(null);

  // Autocomplete suggestions from existing projects
  const [existingCampaigns, setExistingCampaigns] = useState<string[]>([]);
  const [existingClients, setExistingClients] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/projects?limit=500")
      .then((r) => r.json())
      .then((data) => {
        const list = data.projects || [];
        setExistingCampaigns(Array.from(new Set(list.map((p: { campaign?: string }) => p.campaign).filter(Boolean))) as string[]);
        setExistingClients(Array.from(new Set(list.map((p: { category?: string }) => p.category).filter(Boolean))) as string[]);
      })
      .catch(() => {});
  }, []);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"template" | "details">(initialTemplate ? "details" : "template");

  // Auto-apply ?template=… on first load
  useEffect(() => {
    if (initialTemplate && !templateSlug) {
      const tmpl = BUILTIN_TEMPLATES.find((t) => t.slug === initialTemplate);
      if (tmpl) {
        setTemplateSlug(tmpl.slug);
        setName(tmpl.name);
        setDescription(tmpl.description);
        setColor(tmpl.color);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplate]);

  function selectTemplate(slug: string | null) {
    if (slug) {
      const tmpl = BUILTIN_TEMPLATES.find((t) => t.slug === slug);
      if (tmpl) {
        setTemplateSlug(slug);
        if (!name) setName(tmpl.name);
        if (!description) setDescription(tmpl.description);
        setColor(tmpl.color);
      }
    } else {
      setTemplateSlug(null);
    }
    setStep("details");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          icon: icon || null,
          category: clientName.trim() || null,
          campaign: campaign.trim() || null,
          templateSlug,
        }),
      });

      if (res.ok) {
        const project = await res.json();
        router.push(`/projects/${project.id}`);
      }
    } finally {
      setLoading(false);
    }
  }

  // Template selection step
  if (step === "template") {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="gap-1.5 text-gray-500">
              <ArrowLeft size={14} /> Projects
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">New Project</h1>
          <p className="text-gray-500 mt-1">Start from a template or create from scratch.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {BUILTIN_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.slug}
              onClick={() => selectTemplate(tmpl.slug)}
              className="text-left p-4 rounded-xl border border-gray-200 hover:border-[#99ff33] hover:shadow-[0_4px_20px_rgb(153_255_51/0.12)] transition-all group bg-white"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{tmpl.icon}</span>
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tmpl.color }} />
              </div>
              <p className="font-semibold text-sm text-gray-800">{tmpl.name}</p>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{tmpl.description}</p>
              <p className="text-xs text-[#2d5200] mt-2 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                {tmpl.sections.length} sections →
              </p>
            </button>
          ))}
        </div>

        <button
          onClick={() => selectTemplate(null)}
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#99ff33] text-sm text-gray-500 hover:text-gray-800 transition-all font-medium"
        >
          + Start from scratch
        </button>
      </div>
    );
  }

  // Project details step
  return (
    <div className="max-w-xl mx-auto px-6 py-8 animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => setStep("template")} className="gap-1.5 text-gray-500">
          <ArrowLeft size={14} /> Templates
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header preview bar */}
        <div className="h-2" style={{ backgroundColor: color || "#99ff33" }} />

        <div className="p-6">
          {/* Project icon + name preview */}
          <div className="flex items-center gap-3 mb-6">
            <ProjectColorDot icon={icon || undefined} color={color} size="lg" />
            <div>
              <p className="font-bold text-gray-900 text-lg leading-tight">
                {name || "Project name"}
              </p>
              {clientName && (
                <p className="text-sm text-gray-500 mt-0.5">{clientName}</p>
              )}
            </div>
            {templateSlug && (
              <Badge variant="secondary" className="text-xs font-normal ml-auto">
                <Sparkles size={10} className="mr-1" />
                {BUILTIN_TEMPLATES.find((t) => t.slug === templateSlug)?.name}
              </Badge>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Project Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Edge Point Website Revamp"
                required
                autoFocus
                className="border-gray-200 focus:border-[#99ff33] focus:ring-[#99ff33]/30"
              />
            </div>

            {/* Campaign */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign" className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Megaphone size={11} />
                Campaign
              </Label>
              <Input
                id="campaign"
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="e.g. Spring 2026 Campaign"
                list="existing-campaigns"
                className="border-gray-200 focus:border-[#99ff33] focus:ring-[#99ff33]/30"
              />
              <datalist id="existing-campaigns">
                {existingCampaigns.map((c) => <option key={c} value={c} />)}
              </datalist>
              {existingCampaigns.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {existingCampaigns.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCampaign(c === campaign ? "" : c)}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[11px] transition-colors",
                        campaign === c
                          ? "bg-[#0d1a00] text-[#99ff33]"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-400">The top-level grouping — a campaign can contain multiple clients.</p>
            </div>

            {/* Client */}
            <div className="space-y-1.5">
              <Label htmlFor="client" className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Building2 size={11} />
                Client
              </Label>
              <Input
                id="client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Edge Point, Acme Corp, Internal…"
                list="existing-clients"
                className="border-gray-200 focus:border-[#99ff33] focus:ring-[#99ff33]/30"
              />
              <datalist id="existing-clients">
                {existingClients.map((c) => <option key={c} value={c} />)}
              </datalist>
              {existingClients.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {existingClients.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setClientName(c === clientName ? "" : c)}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[11px] transition-colors",
                        clientName === c
                          ? "bg-[#99ff33]/15 text-[#2d5200] ring-1 ring-[#99ff33]/50"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                rows={3}
                className="border-gray-200 focus:border-[#99ff33] focus:ring-[#99ff33]/30 resize-none"
              />
            </div>

            {/* Icon & Color picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Icon & Color
              </Label>
              <div className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                <IconColorPicker
                  selectedIcon={icon}
                  selectedColor={color}
                  onIconChange={(v) => setIcon(v)}
                  onColorChange={(v) => setColor(v)}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#99ff33] hover:bg-[#7acc29] text-[#0d1a00] font-bold h-11 text-base rounded-xl shadow-none"
              disabled={loading}
            >
              {loading ? "Creating…" : "Create Project"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
