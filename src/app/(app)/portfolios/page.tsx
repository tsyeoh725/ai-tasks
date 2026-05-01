"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COLOR_OPTIONS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

type Portfolio = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  projects: { id: string; projectId: string; project: { name: string } }[];
};

export default function PortfoliosPage() {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");

  async function fetchPortfolios() {
    try {
      const res = await fetch("/api/portfolios");
      const data = await res.json();
      setPortfolios(data.portfolios || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPortfolios();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const res = await fetch("/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        color,
      }),
    });

    if (res.ok) {
      setName("");
      setDescription("");
      setColor("#6366f1");
      setCreating(false);
      fetchPortfolios();
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portfolios</h1>
          <p className="text-muted-foreground text-sm">
            Group and track projects across your organization
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
            New Portfolio
          </Button>
        )}
      </div>

      {/* Create Portfolio Form */}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Create Portfolio</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="portfolio-name">Name</Label>
                <Input
                  id="portfolio-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Q2 Initiatives"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portfolio-desc">Description (optional)</Label>
                <Input
                  id="portfolio-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this portfolio for?"
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        color === c
                          ? "border-foreground scale-110"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!name.trim()}>
                  Create
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Grid */}
      {portfolios.length === 0 && !creating ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground mb-4">
              No portfolios yet. Create one to group and track your projects.
            </p>
            <Button onClick={() => setCreating(true)}>
              Create Your First Portfolio
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {portfolios.map((portfolio) => (
            <Card
              key={portfolio.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => router.push(`/portfolios/${portfolio.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div
                    className="w-3 h-3 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: portfolio.color }}
                  />
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{portfolio.name}</h3>
                    {portfolio.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {portfolio.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {portfolio.projects.length} project
                      {portfolio.projects.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
