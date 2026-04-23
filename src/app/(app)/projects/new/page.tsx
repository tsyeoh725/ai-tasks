"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const colors = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#64748b",
];

const iconChoices = [
  "\u{1F4C1}", "\u{1F4BC}", "\u{1F680}", "\u{1F4CA}",
  "\u{1F3AF}", "\u{1F4A1}", "\u{1F6E0}\u{FE0F}", "\u{1F4DD}",
  "\u{1F3A8}", "\u{1F4BB}", "\u{1F3D7}\u{FE0F}", "\u{1F52C}",
];

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(colors[0]);
  const [icon, setIcon] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          icon,
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

  return (
    <div className="p-6 max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>New Project</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex gap-1 flex-wrap mt-1">
                {iconChoices.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setIcon(icon === e ? null : e)}
                    className={cn(
                      "h-9 w-9 rounded-md border flex items-center justify-center text-lg hover:bg-accent transition-colors",
                      icon === e && "bg-accent border-primary"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
              {icon && (
                <p className="text-xs text-muted-foreground">
                  Click again to clear.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full transition-transform ${
                      color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
