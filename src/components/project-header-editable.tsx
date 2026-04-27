"use client";

import { useState, useRef, useEffect } from "react";
import { Check, X, Building2, Megaphone, Smile } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { IconColorPicker, ProjectColorDot } from "@/components/icon-color-picker";
import { useToast } from "@/components/ui/toast";

type EditableProject = {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  category?: string | null;   // client
  campaign?: string | null;
};

export function ProjectHeaderEditable({
  project,
  onUpdate,
}: {
  project: EditableProject;
  onUpdate?: (patch: Partial<EditableProject>) => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [editing, setEditing] = useState<"name" | "campaign" | "client" | null>(null);
  const [localName, setLocalName] = useState(project.name);
  const [localCampaign, setLocalCampaign] = useState(project.campaign ?? "");
  const [localClient, setLocalClient] = useState(project.category ?? "");
  const [iconOpen, setIconOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalName(project.name);
    setLocalCampaign(project.campaign ?? "");
    setLocalClient(project.category ?? "");
  }, [project.name, project.campaign, project.category]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function save(patch: Partial<EditableProject>) {
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        onUpdate?.(patch);
        toastSuccess({ title: "Saved" });
      } else {
        toastError({ title: "Failed to save" });
      }
    } catch {
      toastError({ title: "Network error" });
    }
  }

  async function saveField() {
    if (editing === "name" && localName.trim() && localName !== project.name) {
      await save({ name: localName.trim() });
    } else if (editing === "campaign" && localCampaign !== (project.campaign ?? "")) {
      await save({ campaign: localCampaign.trim() || null });
    } else if (editing === "client" && localClient !== (project.category ?? "")) {
      await save({ category: localClient.trim() || null });
    }
    setEditing(null);
  }

  function cancelEdit() {
    setLocalName(project.name);
    setLocalCampaign(project.campaign ?? "");
    setLocalClient(project.category ?? "");
    setEditing(null);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveField();
    if (e.key === "Escape") cancelEdit();
  }

  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      {/* ── Icon + color picker ── */}
      <Popover open={iconOpen} onOpenChange={setIconOpen}>
        <PopoverTrigger className="shrink-0 rounded-lg hover:ring-2 hover:ring-[#99ff33]/40 transition-all">
          <ProjectColorDot icon={project.icon ?? undefined} color={project.color} size="md" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[340px] p-4">
          <IconColorPicker
            selectedIcon={project.icon ?? ""}
            selectedColor={project.color}
            onIconChange={(v) => save({ icon: v || null })}
            onColorChange={(v) => save({ color: v })}
          />
        </PopoverContent>
      </Popover>

      {/* ── Name + meta stack ── */}
      <div className="min-w-0 flex-1">
        {/* Name */}
        {editing === "name" ? (
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onKeyDown={handleKey}
              onBlur={saveField}
              className="h-7 text-xl font-bold px-1 border-[#99ff33]/50 focus:border-[#99ff33] focus:ring-[#99ff33]/30"
            />
          </div>
        ) : (
          <button
            onClick={() => setEditing("name")}
            className="text-xl font-bold text-gray-900 hover:bg-gray-50 rounded px-1 -mx-1 leading-tight truncate max-w-full text-left block"
          >
            {project.name}
          </button>
        )}

        {/* Campaign · Client line */}
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
          {/* Campaign */}
          {editing === "campaign" ? (
            <div className="flex items-center gap-1">
              <Megaphone size={10} className="text-gray-400" />
              <Input
                ref={inputRef}
                value={localCampaign}
                onChange={(e) => setLocalCampaign(e.target.value)}
                onKeyDown={handleKey}
                onBlur={saveField}
                placeholder="Campaign"
                className="h-5 text-[11px] px-1.5 py-0 w-32 border-[#99ff33]/50"
              />
            </div>
          ) : (
            <button
              onClick={() => setEditing("campaign")}
              className="flex items-center gap-1 hover:bg-gray-100 px-1.5 py-0.5 rounded transition-colors group"
            >
              <Megaphone size={10} className="text-gray-400" />
              <span className={project.campaign ? "" : "italic text-gray-400"}>
                {project.campaign || "+ Campaign"}
              </span>
            </button>
          )}

          <span className="text-gray-300">·</span>

          {/* Client */}
          {editing === "client" ? (
            <div className="flex items-center gap-1">
              <Building2 size={10} className="text-gray-400" />
              <Input
                ref={inputRef}
                value={localClient}
                onChange={(e) => setLocalClient(e.target.value)}
                onKeyDown={handleKey}
                onBlur={saveField}
                placeholder="Client"
                className="h-5 text-[11px] px-1.5 py-0 w-32 border-[#99ff33]/50"
              />
            </div>
          ) : (
            <button
              onClick={() => setEditing("client")}
              className="flex items-center gap-1 hover:bg-gray-100 px-1.5 py-0.5 rounded transition-colors group"
            >
              <Building2 size={10} className="text-gray-400" />
              <span className={project.category ? "" : "italic text-gray-400"}>
                {project.category || "+ Client"}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
