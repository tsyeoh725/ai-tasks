"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProjectStatus = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  isFinal: boolean;
};

// Curated palette with nice Notion-style colors
const COLOR_PALETTE = [
  { label: "Gray", value: "#94a3b8" },
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Yellow", value: "#eab308" },
  { label: "Lime", value: "#84cc16" },
  { label: "Green", value: "#22c55e" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Sky", value: "#0ea5e9" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Indigo", value: "#6366f1" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Fuchsia", value: "#d946ef" },
  { label: "Pink", value: "#ec4899" },
  { label: "Rose", value: "#f43f5e" },
  // Notion-inspired top palettes
  { label: "Sage", value: "#84a98c" },
  { label: "Terracotta", value: "#c07d5a" },
  { label: "Mauve", value: "#9f7ea8" },
  { label: "Slate", value: "#64748b" },
  { label: "Navy", value: "#1e40af" },
  { label: "Forest", value: "#166534" },
  { label: "Crimson", value: "#9b1c1c" },
];

export function ProjectStatusesPanel({ projectId }: { projectId: string }) {
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [newIsFinal, setNewIsFinal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  async function fetchStatuses() {
    try {
      const res = await fetch(`/api/projects/${projectId}/statuses`);
      if (res.ok) setStatuses(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchStatuses closes only over projectId; tracking it directly avoids effect churn
  useEffect(() => { fetchStatuses(); }, [projectId]);

  async function handleAdd() {
    if (!newName.trim()) return;
    await fetch(`/api/projects/${projectId}/statuses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor, sortOrder: statuses.length, isFinal: newIsFinal }),
    });
    setNewName(""); setNewColor("#6366f1"); setNewIsFinal(false); setAdding(false);
    fetchStatuses();
  }

  async function handleUpdate(statusId: string) {
    await fetch(`/api/projects/${projectId}/statuses/${statusId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, color: editColor }),
    });
    setEditingId(null); fetchStatuses();
  }

  async function handleDelete(statusId: string) {
    await fetch(`/api/projects/${projectId}/statuses/${statusId}`, { method: "DELETE" });
    fetchStatuses();
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Custom Statuses</h2>
          <p className="text-sm text-muted-foreground">Define task statuses for this project. Notion-style.</p>
        </div>
        <Button onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Add Status"}</Button>
      </div>

      {adding && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. In Review" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setNewColor(c.value)}
                    className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${newColor === c.value ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""}`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
              <Input value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="#hex" className="mt-2 w-32" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isFinal" checked={newIsFinal} onChange={(e) => setNewIsFinal(e.target.checked)} />
              <label htmlFor="isFinal" className="text-sm">Mark as &quot;Done&quot; equivalent (final status)</label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd}>Create Status</Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {statuses.map((status) => (
          <div key={status.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/30 group">
            {editingId === status.id ? (
              <div className="flex items-center gap-3 flex-1">
                <div className="flex flex-wrap gap-1">
                  {COLOR_PALETTE.map((c) => (
                    <button key={c.value} title={c.label} onClick={() => setEditColor(c.value)}
                      className={`h-5 w-5 rounded-full hover:scale-110 transition-transform ${editColor === c.value ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
                      style={{ backgroundColor: c.value }} />
                  ))}
                </div>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-sm w-40" />
                <Button size="sm" onClick={() => handleUpdate(status.id)}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
              </div>
            ) : (
              <>
                <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                <span className="font-medium text-sm flex-1">{status.name}</span>
                <div className="flex items-center gap-1">
                  {status.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                  {status.isFinal && <Badge variant="outline" className="text-xs text-green-600">Final</Badge>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingId(status.id); setEditName(status.name); setEditColor(status.color); }}>Edit</Button>
                  {!status.isDefault && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDelete(status.id)}>Delete</Button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
